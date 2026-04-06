from unittest.mock import MagicMock, patch

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.reports.models import Report
from apps.users.models import MobilityProfile, User


# A mock OSRM response for two points near Boğaziçi campus
MOCK_OSRM_RESPONSE = {
    'code': 'Ok',
    'routes': [{
        'geometry': {
            'type': 'LineString',
            'coordinates': [
                [29.0510, 41.0825],
                [29.0508, 41.0830],
                [29.0505, 41.0835],
                [29.0500, 41.0840],
                [29.0490, 41.0850],
                [29.0470, 41.0855],
                [29.0450, 41.0860],
                [29.0445, 41.0865],
            ],
        },
        'distance': 620.5,
        'duration': 480.0,
    }],
}


def mock_osrm_get(*args, **kwargs):
    """Return a mock requests.Response with OSRM data."""
    resp = MagicMock()
    resp.status_code = 200
    resp.json.return_value = MOCK_OSRM_RESPONSE
    return resp


def mock_osrm_failure(*args, **kwargs):
    """Return a mock requests.Response simulating OSRM failure."""
    resp = MagicMock()
    resp.status_code = 500
    return resp


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


@patch('apps.routing.services.requests.get', side_effect=mock_osrm_get)
class CalculateRouteViewTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.url = '/api/routes/calculate'
        self.reporter = make_reporter()

    def test_route_returns_waypoints(self, mock_get):
        response = self.client.post(self.url, make_valid_payload(), format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertIn('waypoints', data)
        self.assertIsInstance(data['waypoints'], list)
        self.assertTrue(len(data['waypoints']) >= 2)

    def test_response_has_expected_fields(self, mock_get):
        response = self.client.post(self.url, make_valid_payload(), format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        for field in ('waypoints', 'distanceMeters', 'estimatedTimeSeconds',
                      'avoidedObstaclesCount', 'warnings', 'isAccessible'):
            self.assertIn(field, data)

    def test_distance_and_time_from_osrm(self, mock_get):
        response = self.client.post(self.url, make_valid_payload(), format='json')
        data = response.json()
        self.assertAlmostEqual(data['distanceMeters'], 620.5, places=0)
        self.assertEqual(data['estimatedTimeSeconds'], 480)

    def test_waypoints_are_lat_lng(self, mock_get):
        response = self.client.post(self.url, make_valid_payload(), format='json')
        data = response.json()
        first_wp = data['waypoints'][0]
        self.assertAlmostEqual(first_wp[0], 41.0825, places=3)
        self.assertAlmostEqual(first_wp[1], 29.0510, places=3)

    def test_no_obstacles_means_accessible(self, mock_get):
        response = self.client.post(self.url, make_valid_payload(), format='json')
        data = response.json()
        self.assertTrue(data['isAccessible'])
        self.assertEqual(data['avoidedObstaclesCount'], 0)

    def test_verified_obstacle_near_route_generates_warning(self, mock_get):
        Report.objects.create(
            reporter=self.reporter,
            title='Blocked path',
            description='Construction blocking path',
            category='BLOCKED_PATH',
            context='OUTDOOR',
            status='VERIFIED',
            latitude=41.0835,
            longitude=29.0505,
        )
        response = self.client.post(self.url, make_valid_payload(), format='json')
        data = response.json()
        self.assertEqual(data['avoidedObstaclesCount'], 1)
        self.assertFalse(data['isAccessible'])
        self.assertTrue(any('Blocked path' in w for w in data['warnings']))

    def test_unverified_obstacle_generates_warning(self, mock_get):
        Report.objects.create(
            reporter=self.reporter,
            title='Possible pothole',
            description='Looks like a pothole',
            category='DAMAGED_SURFACE',
            context='OUTDOOR',
            status='UNVERIFIED',
            latitude=41.0840,
            longitude=29.0500,
        )
        response = self.client.post(self.url, make_valid_payload(), format='json')
        data = response.json()
        self.assertTrue(any('Possible pothole' in w for w in data['warnings']))

    def test_indoor_reports_excluded(self, mock_get):
        Report.objects.create(
            reporter=self.reporter,
            title='Indoor obstacle',
            description='Elevator broken',
            category='OTHER',
            context='INDOOR',
            status='VERIFIED',
            latitude=41.0835,
            longitude=29.0505,
        )
        response = self.client.post(self.url, make_valid_payload(), format='json')
        data = response.json()
        self.assertEqual(data['avoidedObstaclesCount'], 0)
        self.assertTrue(data['isAccessible'])

    def test_passive_reports_excluded(self, mock_get):
        Report.objects.create(
            reporter=self.reporter,
            title='Passive obstacle',
            description='Old report',
            category='DAMAGED_SURFACE',
            context='OUTDOOR',
            status='PASSIVE',
            latitude=41.0835,
            longitude=29.0505,
        )
        response = self.client.post(self.url, make_valid_payload(), format='json')
        data = response.json()
        self.assertEqual(data['avoidedObstaclesCount'], 0)

    def test_guest_with_preferences(self, mock_get):
        payload = make_valid_payload(preferences={
            'avoidStairs': True,
            'avoidSteepSlopes': True,
            'maxSlopeGradient': 8.0,
        })
        response = self.client.post(self.url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_registered_user_uses_mobility_profile(self, mock_get):
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

    def test_missing_fields_returns_400(self, mock_get):
        response = self.client.post(self.url, {'originLat': 41.0}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_accessible_without_auth(self, mock_get):
        response = self.client.post(self.url, make_valid_payload(), format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)


class CalculateRouteOSRMFailureTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.url = '/api/routes/calculate'

    @patch('apps.routing.services.requests.get', side_effect=mock_osrm_failure)
    def test_osrm_failure_returns_400(self, mock_get):
        response = self.client.post(self.url, make_valid_payload(), format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        data = response.json()
        self.assertIn('error', data)
        self.assertEqual(data['error']['code'], 'ROUTE_ERROR')
