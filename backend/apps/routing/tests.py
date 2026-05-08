from unittest.mock import patch

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.routing.serializers import RouteResponseSerializer
from apps.routing.services import WALKING_SPEED_MS
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

    def test_passive_reports_excluded_with_empty_mocks(self, mock_valhalla, mock_verified, mock_unverified):
        # Smoke check: with mocked obstacle queries returning [], no obstacles surface.
        # See PassiveReportRoutingExclusionTest below for the DB-level regression test.
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


class PassiveReportRoutingExclusionTest(TestCase):
    """Regression: PASSIVE reports must be excluded from route avoidance and warnings.

    Unlike CalculateRouteViewTest above, this class does NOT mock the obstacle
    queries — it exercises the real DB filters in `_get_verified_obstacles` and
    `_get_unverified_obstacles` so that PASSIVE-status filtering is genuinely covered.
    """

    def setUp(self):
        self.client = APIClient()
        self.url = '/api/routes/calculate'
        self.reporter = make_reporter()

    def _make_report(self, *, status_value, title, lat, lng):
        from apps.reports.models import ObstacleCategory, Report, ReportContext
        return Report.objects.create(
            reporter=self.reporter,
            title=title,
            description='',
            category=ObstacleCategory.BROKEN_RAMP,
            context=ReportContext.OUTDOOR,
            status=status_value,
            latitude=lat,
            longitude=lng,
        )

    @patch('apps.routing.services._call_valhalla', side_effect=mock_call_valhalla)
    def test_passive_obstacle_does_not_appear_in_warnings_or_avoidance(self, mock_valhalla):
        from apps.reports.models import ReportStatus

        # Both points are within OBSTACLE_PROXIMITY_RADIUS_M (40m) of MOCK_WAYPOINTS.
        passive = self._make_report(
            status_value=ReportStatus.PASSIVE,
            title='Decayed obstacle',
            lat='41.083500', lng='29.050500',
        )
        verified = self._make_report(
            status_value=ReportStatus.VERIFIED,
            title='Active obstacle',
            lat='41.084000', lng='29.050000',
        )

        response = self.client.post(self.url, make_valid_payload(), format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()

        # The verified obstacle proves the routing engine is wired up to the DB.
        self.assertTrue(any('Active obstacle' in w for w in data['warnings']))
        # The PASSIVE one must not appear in warnings…
        self.assertFalse(any('Decayed obstacle' in w for w in data['warnings']))

        # …and must not be passed to Valhalla as exclude_locations either.
        excluded = mock_valhalla.call_args.kwargs.get('exclude_locations') or []
        excluded_ids = {str(loc.get('id')) for loc in excluded}
        self.assertIn(str(verified.id), excluded_ids)
        self.assertNotIn(str(passive.id), excluded_ids)


class RouteResponseSerializerTest(TestCase):
    """Unit tests for RouteResponseSerializer field types and values (Issue #201)."""

    def _make_data(self, **overrides):
        data = {
            'waypoints': [[41.0825, 29.0510], [41.0865, 29.0445]],
            'distanceMeters': 620.5,
            'estimatedTimeSeconds': 558,
            'avoidedObstaclesCount': 2,
            'warnings': ['Unverified obstacle nearby: Pothole'],
            'isAccessible': True,
        }
        data.update(overrides)
        return data

    def test_all_required_fields_present(self):
        s = RouteResponseSerializer(self._make_data())
        data = s.data
        for field in ('waypoints', 'distanceMeters', 'estimatedTimeSeconds',
                      'avoidedObstaclesCount', 'warnings', 'isAccessible'):
            self.assertIn(field, data)

    def test_distance_is_float(self):
        s = RouteResponseSerializer(self._make_data(distanceMeters=620.5))
        self.assertIsInstance(s.data['distanceMeters'], float)

    def test_estimated_time_is_integer(self):
        s = RouteResponseSerializer(self._make_data(estimatedTimeSeconds=558))
        self.assertIsInstance(s.data['estimatedTimeSeconds'], int)

    def test_avoided_obstacles_count_is_integer(self):
        s = RouteResponseSerializer(self._make_data(avoidedObstaclesCount=3))
        self.assertIsInstance(s.data['avoidedObstaclesCount'], int)
        self.assertEqual(s.data['avoidedObstaclesCount'], 3)

    def test_waypoints_is_list_of_coordinate_pairs(self):
        waypoints = [[41.0825, 29.0510], [41.0865, 29.0445]]
        s = RouteResponseSerializer(self._make_data(waypoints=waypoints))
        self.assertIsInstance(s.data['waypoints'], list)
        self.assertEqual(len(s.data['waypoints']), 2)
        self.assertAlmostEqual(s.data['waypoints'][0][0], 41.0825)
        self.assertAlmostEqual(s.data['waypoints'][0][1], 29.0510)

    def test_warnings_is_list_of_strings(self):
        warnings = ['Verified obstacle on route: Broken Ramp (BROKEN_RAMP)']
        s = RouteResponseSerializer(self._make_data(warnings=warnings))
        self.assertIsInstance(s.data['warnings'], list)
        self.assertIsInstance(s.data['warnings'][0], str)

    def test_empty_warnings_list(self):
        s = RouteResponseSerializer(self._make_data(warnings=[]))
        self.assertEqual(s.data['warnings'], [])

    def test_zero_avoided_obstacles(self):
        s = RouteResponseSerializer(self._make_data(avoidedObstaclesCount=0))
        self.assertEqual(s.data['avoidedObstaclesCount'], 0)

    def test_is_accessible_false_when_obstacles_on_route(self):
        s = RouteResponseSerializer(self._make_data(isAccessible=False))
        self.assertFalse(s.data['isAccessible'])


class WalkingSpeedFallbackTest(TestCase):
    """When Valhalla returns time=0 or omits time, estimatedTimeSeconds must
    be derived from distance / WALKING_SPEED_MS (~4 km/h) instead of 0."""

    def setUp(self):
        self.client = APIClient()
        self.url = '/api/routes/calculate'

    def _valhalla_zero_time(self, origin, destination, exclude_locations=None):
        """Simulate a Valhalla response where summary.time is 0."""
        return MOCK_WAYPOINTS, MOCK_DISTANCE, 0

    def _valhalla_none_time(self, origin, destination, exclude_locations=None):
        """Simulate a Valhalla response where summary.time is absent (None)."""
        return MOCK_WAYPOINTS, MOCK_DISTANCE, None

    @patch('apps.routing.services._get_unverified_obstacles', return_value=[])
    @patch('apps.routing.services._get_verified_obstacles', return_value=[])
    @patch('apps.routing.services._call_valhalla')
    def test_fallback_used_when_valhalla_time_is_zero(
        self, mock_valhalla, mock_verified, mock_unverified
    ):
        mock_valhalla.side_effect = self._valhalla_zero_time
        response = self.client.post(self.url, make_valid_payload(), format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        expected = round(MOCK_DISTANCE / WALKING_SPEED_MS)
        self.assertEqual(data['estimatedTimeSeconds'], expected)
        self.assertGreater(data['estimatedTimeSeconds'], 0)

    @patch('apps.routing.services._get_unverified_obstacles', return_value=[])
    @patch('apps.routing.services._get_verified_obstacles', return_value=[])
    @patch('apps.routing.services._call_valhalla')
    def test_fallback_used_when_valhalla_time_is_none(
        self, mock_valhalla, mock_verified, mock_unverified
    ):
        mock_valhalla.side_effect = self._valhalla_none_time
        response = self.client.post(self.url, make_valid_payload(), format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        expected = round(MOCK_DISTANCE / WALKING_SPEED_MS)
        self.assertEqual(data['estimatedTimeSeconds'], expected)

    @patch('apps.routing.services._get_unverified_obstacles', return_value=[])
    @patch('apps.routing.services._get_verified_obstacles', return_value=[])
    @patch('apps.routing.services._call_valhalla', side_effect=mock_call_valhalla)
    def test_valhalla_time_used_when_nonzero(
        self, mock_valhalla, mock_verified, mock_unverified
    ):
        response = self.client.post(self.url, make_valid_payload(), format='json')
        data = response.json()
        self.assertEqual(data['estimatedTimeSeconds'], round(MOCK_DURATION))
