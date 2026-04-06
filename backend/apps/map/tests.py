from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.users.models import User
from apps.reports.models import Report, Photo, Interaction, ReportStatus, ObstacleCategory, ReportContext, InteractionType


def make_user(email="user@test.com"):
    return User.objects.create_user(email=email, full_name="Test User", password="pass")


def make_report(reporter, lat="41.083700", lng="29.051000", report_status=ReportStatus.VERIFIED, **kwargs):
    defaults = dict(
        title="Broken Ramp",
        description="The ramp is broken.",
        category=ObstacleCategory.BROKEN_RAMP,
        context=ReportContext.OUTDOOR,
        status=report_status,
        latitude=lat,
        longitude=lng,
    )
    defaults.update(kwargs)
    return Report.objects.create(reporter=reporter, **defaults)


BBOX = "29.0490,41.0820,29.0530,41.0850"  # covers default lat/lng above


# ---------------------------------------------------------------------------
# Selector: get_obstacles_in_bbox
# ---------------------------------------------------------------------------

class GetObstaclesInBboxTest(TestCase):
    def setUp(self):
        self.user = make_user()

    def test_returns_verified_reports_in_bbox(self):
        from apps.map.selectors import get_obstacles_in_bbox
        make_report(self.user, report_status=ReportStatus.VERIFIED)
        qs = get_obstacles_in_bbox(29.0490, 41.0820, 29.0530, 41.0850)
        self.assertEqual(qs.count(), 1)

    def test_excludes_unverified_reports(self):
        from apps.map.selectors import get_obstacles_in_bbox
        make_report(self.user, report_status=ReportStatus.UNVERIFIED)
        qs = get_obstacles_in_bbox(29.0490, 41.0820, 29.0530, 41.0850)
        self.assertEqual(qs.count(), 0)

    def test_excludes_passive_by_default(self):
        from apps.map.selectors import get_obstacles_in_bbox
        make_report(self.user, report_status=ReportStatus.PASSIVE)
        qs = get_obstacles_in_bbox(29.0490, 41.0820, 29.0530, 41.0850)
        self.assertEqual(qs.count(), 0)

    def test_includes_passive_when_flag_set(self):
        from apps.map.selectors import get_obstacles_in_bbox
        make_report(self.user, report_status=ReportStatus.PASSIVE)
        qs = get_obstacles_in_bbox(29.0490, 41.0820, 29.0530, 41.0850, include_passive=True)
        self.assertEqual(qs.count(), 1)

    def test_excludes_reports_outside_bbox(self):
        from apps.map.selectors import get_obstacles_in_bbox
        make_report(self.user, lat="41.0900", lng="29.0600", report_status=ReportStatus.VERIFIED)
        qs = get_obstacles_in_bbox(29.0490, 41.0820, 29.0530, 41.0850)
        self.assertEqual(qs.count(), 0)

    def test_returns_multiple_reports(self):
        from apps.map.selectors import get_obstacles_in_bbox
        make_report(self.user, report_status=ReportStatus.VERIFIED)
        make_report(self.user, lat="41.0840", lng="29.0510", report_status=ReportStatus.VERIFIED)
        qs = get_obstacles_in_bbox(29.0490, 41.0820, 29.0530, 41.0850)
        self.assertEqual(qs.count(), 2)


# ---------------------------------------------------------------------------
# Selector: get_obstacle_detail
# ---------------------------------------------------------------------------

class GetObstacleDetailTest(TestCase):
    def setUp(self):
        self.user = make_user()

    def test_returns_verified_report(self):
        from apps.map.selectors import get_obstacle_detail
        report = make_report(self.user, report_status=ReportStatus.VERIFIED)
        result = get_obstacle_detail(report.pk)
        self.assertIsNotNone(result)
        self.assertEqual(result.pk, report.pk)

    def test_returns_passive_report(self):
        from apps.map.selectors import get_obstacle_detail
        report = make_report(self.user, report_status=ReportStatus.PASSIVE)
        result = get_obstacle_detail(report.pk)
        self.assertIsNotNone(result)

    def test_returns_none_for_unverified(self):
        from apps.map.selectors import get_obstacle_detail
        report = make_report(self.user, report_status=ReportStatus.UNVERIFIED)
        result = get_obstacle_detail(report.pk)
        self.assertIsNone(result)

    def test_returns_none_for_nonexistent(self):
        import uuid
        from apps.map.selectors import get_obstacle_detail
        result = get_obstacle_detail(uuid.uuid4())
        self.assertIsNone(result)


# ---------------------------------------------------------------------------
# View: GET /api/map/obstacles/
# ---------------------------------------------------------------------------

class ObstacleListViewTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.url = "/api/map/obstacles/"
        self.user = make_user()

    def test_returns_verified_obstacles(self):
        make_report(self.user, report_status=ReportStatus.VERIFIED)
        response = self.client.get(self.url, {"bbox": BBOX})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertIn("results", data)
        self.assertEqual(len(data["results"]), 1)

    def test_missing_bbox_returns_400(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_invalid_bbox_returns_400(self):
        response = self.client.get(self.url, {"bbox": "invalid"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_excludes_passive_by_default(self):
        make_report(self.user, report_status=ReportStatus.PASSIVE)
        response = self.client.get(self.url, {"bbox": BBOX})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.json()["results"]), 0)

    def test_includes_passive_with_flag(self):
        make_report(self.user, report_status=ReportStatus.PASSIVE)
        response = self.client.get(self.url, {"bbox": BBOX, "includePassive": "true"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.json()["results"]), 1)

    def test_response_fields(self):
        make_report(self.user, report_status=ReportStatus.VERIFIED)
        response = self.client.get(self.url, {"bbox": BBOX})
        item = response.json()["results"][0]
        for field in ("id", "category", "context", "status", "latitude", "longitude", "createdAt"):
            self.assertIn(field, item)

    def test_accessible_without_auth(self):
        response = self.client.get(self.url, {"bbox": BBOX})
        self.assertEqual(response.status_code, status.HTTP_200_OK)


# ---------------------------------------------------------------------------
# View: GET /api/map/obstacles/<id>/
# ---------------------------------------------------------------------------

class ObstacleDetailViewTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = make_user()

    def _url(self, report_id):
        return f"/api/map/obstacles/{report_id}/"

    def test_returns_obstacle_detail(self):
        report = make_report(self.user, report_status=ReportStatus.VERIFIED)
        response = self.client.get(self._url(report.pk))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        for field in ("id", "category", "context", "status", "description", "latitude", "longitude", "createdAt", "photos", "upvoteCount"):
            self.assertIn(field, data)

    def test_upvote_count_correct(self):
        report = make_report(self.user, report_status=ReportStatus.VERIFIED)
        user2 = make_user("user2@test.com")
        Interaction.objects.create(report=report, user=self.user, interaction_type=InteractionType.UPVOTE)
        Interaction.objects.create(report=report, user=user2, interaction_type=InteractionType.UPVOTE)

        response = self.client.get(self._url(report.pk))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["upvoteCount"], 2)

    def test_photos_included(self):
        report = make_report(self.user, report_status=ReportStatus.VERIFIED)
        Photo.objects.create(report=report, image_url="https://example.com/photo.jpg")

        response = self.client.get(self._url(report.pk))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        photos = response.json()["photos"]
        self.assertEqual(len(photos), 1)
        self.assertEqual(photos[0]["url"], "https://example.com/photo.jpg")

    def test_unverified_returns_404(self):
        report = make_report(self.user, report_status=ReportStatus.UNVERIFIED)
        response = self.client.get(self._url(report.pk))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_nonexistent_returns_404(self):
        import uuid
        response = self.client.get(self._url(uuid.uuid4()))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_accessible_without_auth(self):
        report = make_report(self.user, report_status=ReportStatus.VERIFIED)
        response = self.client.get(self._url(report.pk))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
