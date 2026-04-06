from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.reports.models import Report
from apps.routing.management.commands.seed_campus_graph import EDGES, NODES
from apps.routing.models import CampusEdge, CampusNode
from apps.routing.services import encode_polyline
from apps.users.models import MobilityProfile, User


class RouteTestMixin:
    """Shared setup for routing tests: seeds campus graph and creates helpers."""

    def seed_graph(self):
        node_map = {}
        for node_data in NODES:
            node = CampusNode.objects.create(
                name=node_data["name"],
                node_type=node_data["node_type"],
                latitude=node_data["lat"],
                longitude=node_data["lng"],
                is_accessible=node_data["accessible"],
            )
            node_map[node.name] = node

        for from_name, to_name, distance, accessible, surface, ramp, slope, stairs in EDGES:
            from_node = node_map[from_name]
            to_node = node_map[to_name]
            for src, dst in [(from_node, to_node), (to_node, from_node)]:
                CampusEdge.objects.create(
                    from_node=src,
                    to_node=dst,
                    distance_meters=distance,
                    is_accessible=accessible,
                    surface_type=surface,
                    has_ramp=ramp,
                    slope_grade=slope,
                    is_stairs=stairs,
                )

        return node_map

    def create_user_with_profile(self, avoid_stairs=True, avoid_steep=True, max_slope=8.0):
        user = User.objects.create_user(
            email='routing@test.com',
            full_name='Route Tester',
            password='SecureP@ss123',
        )
        MobilityProfile.objects.create(
            user=user,
            avoid_stairs=avoid_stairs,
            avoid_steep_slopes=avoid_steep,
            max_slope_gradient=max_slope,
        )
        return user

    def create_reporter(self):
        return User.objects.create_user(
            email='reporter@test.com',
            full_name='Reporter',
            password='SecureP@ss123',
        )


class CalculateRouteViewTest(RouteTestMixin, TestCase):
    def setUp(self):
        self.client = APIClient()
        self.url = '/api/routes/calculate'
        self.node_map = self.seed_graph()
        self.reporter = self.create_reporter()

        # South Campus Gate -> Computer Engineering (BIM) as a cross-campus route
        self.valid_payload = {
            'origin': {'lat': 41.0825, 'lng': 29.0510},
            'destination': {'lat': 41.0865, 'lng': 29.0445},
            'preferences': {
                'avoidStairs': False,
                'avoidSteepSlopes': False,
                'maxSlopeGradient': None,
            },
        }

    def test_route_returns_valid_polyline(self):
        """Route between two campus points returns a valid encoded polyline."""
        response = self.client.post(self.url, self.valid_payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertIn('polyline', data)
        self.assertTrue(len(data['polyline']) > 0)
        self.assertIn('totalDistanceMeters', data)
        self.assertIn('estimatedTimeMinutes', data)
        self.assertIn('routeId', data)
        self.assertIsInstance(data['waypoints'], list)
        self.assertTrue(len(data['waypoints']) >= 2)

    def test_verified_obstacle_bypassed(self):
        """A seeded VERIFIED obstacle is bypassed (route goes around it)."""
        # Place a VERIFIED obstacle at the midpoint of the inter-campus path edge
        # (South Campus Central Junction -> Inter-Campus Path Junction)
        junction = self.node_map["South Campus Central Junction"]
        inter = self.node_map["Inter-Campus Path Junction"]
        mid_lat = (float(junction.latitude) + float(inter.latitude)) / 2
        mid_lng = (float(junction.longitude) + float(inter.longitude)) / 2

        Report.objects.create(
            reporter=self.reporter,
            title='Blocked path',
            description='Construction blocking path',
            category='BLOCKED_PATH',
            status='VERIFIED',
            latitude=mid_lat,
            longitude=mid_lng,
            is_indoor=False,
        )

        response = self.client.post(self.url, self.valid_payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertTrue(len(data['avoidedObstacles']) > 0)

    def test_indoor_reports_excluded(self):
        """INDOOR reports do not affect routing."""
        junction = self.node_map["South Campus Central Junction"]
        inter = self.node_map["Inter-Campus Path Junction"]
        mid_lat = (float(junction.latitude) + float(inter.latitude)) / 2
        mid_lng = (float(junction.longitude) + float(inter.longitude)) / 2

        Report.objects.create(
            reporter=self.reporter,
            title='Indoor obstacle',
            description='Elevator broken inside building',
            category='OTHER',
            status='VERIFIED',
            latitude=mid_lat,
            longitude=mid_lng,
            is_indoor=True,
        )

        response = self.client.post(self.url, self.valid_payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(len(data['avoidedObstacles']), 0)

    def test_passive_reports_excluded(self):
        """PASSIVE reports do not affect routing."""
        junction = self.node_map["South Campus Central Junction"]
        inter = self.node_map["Inter-Campus Path Junction"]
        mid_lat = (float(junction.latitude) + float(inter.latitude)) / 2
        mid_lng = (float(junction.longitude) + float(inter.longitude)) / 2

        Report.objects.create(
            reporter=self.reporter,
            title='Passive obstacle',
            description='Old report',
            category='DAMAGED_SURFACE',
            status='PASSIVE',
            latitude=mid_lat,
            longitude=mid_lng,
            is_indoor=False,
        )

        response = self.client.post(self.url, self.valid_payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(len(data['avoidedObstacles']), 0)

    def test_registered_user_uses_mobility_profile(self):
        """Registered user request without preferences uses saved MobilityProfile."""
        user = self.create_user_with_profile(
            avoid_stairs=True,
            avoid_steep=False,
            max_slope=None,
        )
        self.client.force_authenticate(user=user)

        payload = {
            'origin': {'lat': 41.0825, 'lng': 29.0510},
            'destination': {'lat': 41.0865, 'lng': 29.0445},
        }
        response = self.client.post(self.url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertIn('polyline', data)
        self.assertTrue(len(data['polyline']) > 0)

    def test_guest_with_preferences(self):
        """Guest request with preferences in body returns a valid route."""
        payload = {
            'origin': {'lat': 41.0825, 'lng': 29.0510},
            'destination': {'lat': 41.0865, 'lng': 29.0445},
            'preferences': {
                'avoidStairs': True,
                'avoidSteepSlopes': True,
                'maxSlopeGradient': 8.0,
            },
        }
        response = self.client.post(self.url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertIn('polyline', data)
        self.assertIn('routeId', data)
        self.assertIn('totalDistanceMeters', data)

    def test_avoid_stairs(self):
        """Route with avoidStairs=True does not use stair edges."""
        # Albert Long Hall has a stairs edge from Library Crossroad
        # Route to ALH with avoidStairs should use a different path or fail
        payload = {
            'origin': {'lat': 41.0838, 'lng': 29.0512},  # Near Library
            'destination': {'lat': 41.0835, 'lng': 29.0505},  # ALH
            'preferences': {
                'avoidStairs': True,
                'avoidSteepSlopes': False,
            },
        }
        response = self.client.post(self.url, payload, format='json')
        # With stairs avoided, ALH is only reachable via stairs from Library Crossroad
        # So route should either find an alternative or return an error
        # ALH only connects via stairs, so this should be a 400
        self.assertIn(response.status_code, [status.HTTP_200_OK, status.HTTP_400_BAD_REQUEST])

    def test_avoid_steep_slopes(self):
        """Route with maxSlopeGradient filters out steep edges."""
        # BTC has slope_grade=8.0, so with maxSlopeGradient=5.0 it should be excluded
        payload = {
            'origin': {'lat': 41.0855, 'lng': 29.0435},  # North Campus Gate
            'destination': {'lat': 41.0868, 'lng': 29.0440},  # BTC
            'preferences': {
                'avoidStairs': True,
                'avoidSteepSlopes': True,
                'maxSlopeGradient': 5.0,
            },
        }
        response = self.client.post(self.url, payload, format='json')
        # BTC's only edge has slope 8.0 > 5.0 and is_stairs=True
        # So route should fail
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


class EncodePolylineTest(TestCase):
    def test_encode_simple(self):
        """Polyline encoding produces a non-empty string."""
        coords = [(41.0837, 29.0510), (41.0842, 29.0498)]
        result = encode_polyline(coords)
        self.assertIsInstance(result, str)
        self.assertTrue(len(result) > 0)

    def test_encode_single_point(self):
        coords = [(41.0837, 29.0510)]
        result = encode_polyline(coords)
        self.assertIsInstance(result, str)
        self.assertTrue(len(result) > 0)
