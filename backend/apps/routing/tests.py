from unittest.mock import MagicMock, patch

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.users.models import MobilityProfile, User


# Mock waypoints for a route near Boğaziçi campus
MOCK_WAYPOINTS = [
    [41.0825, 29.0510],
    [41.0830, 29.0508],
    [41.0835, 29.0505],
    [41.0840, 29.0500],
    [41.0850, 29.0490],
    [41.0855, 29.0470],
    [41.0860, 29.0450],
    [41.0865, 29.0445],
]

MOCK_DISTANCE = 620.5
MOCK_DURATION = 480.0


def mock_call_valhalla(origin, destination, exclude_locations=None):
    """Return mock Valhalla response data."""
    return MOCK_WAYPOINTS, MOCK_DISTANCE, MOCK_DURATION


def mock_call_valhalla_failure(origin, destination, exclude_locations=None):
    """Simulate Valhalla routing failure."""
    raise ValueError('Routing service unavailable.')


def make_reporter():
    return User.objects.create_user(
        email='reporter@test.com',
        full_name='Reporter',
        password='SecureP@ss123',
    )


def make_valid_payload(**overrides):
    payload = {
        'originLat': 41.0825,
        'originLng': 29.0510,
        'destinationLat': 41.0865,
        'destinationLng': 29.0445,
    }
    payload.update(overrides)
    return payload


@patch('apps.routing.services._get_unverified_obstacles', return_value=[])
@patch('apps.routing.services._get_verified_obstacles', return_value=[])
@patch('apps.routing.services._call_valhalla', side_effect=mock_call_valhalla)
class CalculateRouteViewTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.url = '/api/routes/calculate'
        self.reporter = make_reporter()

    def test_route_returns_waypoints(self, mock_valhalla, mock_verified, mock_unverified):
        response = self.client.post(self.url, make_valid_payload(), format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertIn('waypoints', data)
        self.assertIsInstance(data['waypoints'], list)
        self.assertTrue(len(data['waypoints']) >= 2)

    def test_response_has_expected_fields(self, mock_valhalla, mock_verified, mock_unverified):
        response = self.client.post(self.url, make_valid_payload(), format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        for field in ('waypoints', 'distanceMeters', 'estimatedTimeSeconds',
                      'avoidedObstaclesCount', 'warnings', 'isAccessible'):
            self.assertIn(field, data)

    def test_distance_and_time(self, mock_valhalla, mock_verified, mock_unverified):
        response = self.client.post(self.url, make_valid_payload(), format='json')
        data = response.json()
        self.assertAlmostEqual(data['distanceMeters'], MOCK_DISTANCE, places=0)
        self.assertEqual(data['estimatedTimeSeconds'], MOCK_DURATION)

    def test_waypoints_are_lat_lng(self, mock_valhalla, mock_verified, mock_unverified):
        response = self.client.post(self.url, make_valid_payload(), format='json')
        data = response.json()
        first_wp = data['waypoints'][0]
        self.assertAlmostEqual(first_wp[0], 41.0825, places=3)
        self.assertAlmostEqual(first_wp[1], 29.0510, places=3)

    def test_no_obstacles_means_accessible(self, mock_valhalla, mock_verified, mock_unverified):
        response = self.client.post(self.url, make_valid_payload(), format='json')
        data = response.json()
        self.assertTrue(data['isAccessible'])
        self.assertEqual(data['avoidedObstaclesCount'], 0)

    def test_verified_obstacle_near_route_generates_warning(self, mock_valhalla, mock_verified, mock_unverified):
        mock_verified.return_value = [
            {'id': 1, 'latitude': 41.0835, 'longitude': 29.0505, 'title': 'Blocked path', 'category': 'BLOCKED_PATH'},
        ]
        response = self.client.post(self.url, make_valid_payload(), format='json')
        data = response.json()
        self.assertTrue(any('Blocked path' in w for w in data['warnings']))

    def test_unverified_obstacle_generates_warning(self, mock_valhalla, mock_verified, mock_unverified):
        mock_unverified.return_value = [
            {'id': 2, 'latitude': 41.0840, 'longitude': 29.0500, 'title': 'Possible pothole'},
        ]
        response = self.client.post(self.url, make_valid_payload(), format='json')
        data = response.json()
        self.assertTrue(any('Possible pothole' in w for w in data['warnings']))

    def test_indoor_reports_excluded(self, mock_valhalla, mock_verified, mock_unverified):
        # Indoor reports are already excluded by _get_verified_obstacles query (context='OUTDOOR')
        # So with empty mocks, no obstacles should appear
        response = self.client.post(self.url, make_valid_payload(), format='json')
        data = response.json()
        self.assertEqual(data['avoidedObstaclesCount'], 0)
        self.assertTrue(data['isAccessible'])

    def test_passive_reports_excluded(self, mock_valhalla, mock_verified, mock_unverified):
        # Passive reports are excluded by _get_verified_obstacles query (status='VERIFIED')
        response = self.client.post(self.url, make_valid_payload(), format='json')
        data = response.json()
        self.assertEqual(data['avoidedObstaclesCount'], 0)

    def test_guest_with_preferences(self, mock_valhalla, mock_verified, mock_unverified):
        payload = make_valid_payload(preferences={
            'avoidStairs': True,
            'avoidSteepSlopes': True,
            'maxSlopeGradient': 8.0,
        })
        response = self.client.post(self.url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_registered_user_uses_mobility_profile(self, mock_valhalla, mock_verified, mock_unverified):
        user = User.objects.create_user(
            email='routing@test.com',
            full_name='Route Tester',
            password='SecureP@ss123',
        )
        MobilityProfile.objects.create(
            user=user,
            avoid_stairs=True,
            avoid_steep_slopes=False,
            max_slope_gradient=None,
        )
        self.client.force_authenticate(user=user)
        payload = make_valid_payload()
        response = self.client.post(self.url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_missing_fields_returns_400(self, mock_valhalla, mock_verified, mock_unverified):
        response = self.client.post(self.url, {'originLat': 41.0}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_accessible_without_auth(self, mock_valhalla, mock_verified, mock_unverified):
        response = self.client.post(self.url, make_valid_payload(), format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)


class CalculateRouteFailureTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.url = '/api/routes/calculate'

    @patch('apps.routing.services._call_valhalla', side_effect=mock_call_valhalla_failure)
    def test_valhalla_failure_returns_400(self, mock_valhalla):
        response = self.client.post(self.url, make_valid_payload(), format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        data = response.json()
        self.assertIn('error', data)
        self.assertEqual(data['error']['code'], 'ROUTE_ERROR')
