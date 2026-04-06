from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.users.models import User
from apps.reports.models import (
    Report, Photo, Interaction, StatusChange,
    ReportStatus, ObstacleCategory, ReportContext, InteractionType,
)


def make_user(email="user@test.com"):
    return User.objects.create_user(email=email, full_name="Test User", password="pass")


def make_report(reporter, lat="41.083700", lng="29.051000", report_status=ReportStatus.VERIFIED, is_indoor=False, **kwargs):
    defaults = dict(
        title="Broken Ramp",
        description="The ramp is broken.",
        category=ObstacleCategory.BROKEN_RAMP,
        context=context,
        status=report_status,
        latitude=lat,
        longitude=lng,
    )
    defaults.update(kwargs)
    return Report.objects.create(reporter=reporter, **defaults)


# bbox: sw_lat, sw_lng, ne_lat, ne_lng
BBOX = "41.0820,29.0490,41.0850,29.0530"


# ---------------------------------------------------------------------------
# Selector: get_obstacles_in_bbox
# ---------------------------------------------------------------------------

class GetObstaclesInBboxTest(TestCase):
    def setUp(self):
        self.user = make_user()

    def test_returns_verified_outdoor_reports_in_bbox(self):
        from apps.map.selectors import get_obstacles_in_bbox
        make_report(self.user, report_status=ReportStatus.VERIFIED)
        qs = get_obstacles_in_bbox(41.0820, 29.0490, 41.0850, 29.0530)
        self.assertEqual(qs.count(), 1)

    def test_excludes_indoor_reports(self):
        from apps.map.selectors import get_obstacles_in_bbox
        make_report(self.user, report_status=ReportStatus.VERIFIED, context=ReportContext.INDOOR)
        qs = get_obstacles_in_bbox(41.0820, 29.0490, 41.0850, 29.0530)
        self.assertEqual(qs.count(), 0)

    def test_excludes_unverified_reports(self):
        from apps.map.selectors import get_obstacles_in_bbox
        make_report(self.user, report_status=ReportStatus.UNVERIFIED)
        qs = get_obstacles_in_bbox(41.0820, 29.0490, 41.0850, 29.0530)
        self.assertEqual(qs.count(), 0)

    def test_excludes_passive_by_default(self):
        from apps.map.selectors import get_obstacles_in_bbox
        make_report(self.user, report_status=ReportStatus.PASSIVE)
        qs = get_obstacles_in_bbox(41.0820, 29.0490, 41.0850, 29.0530)
        self.assertEqual(qs.count(), 0)

    def test_includes_passive_when_flag_set(self):
        from apps.map.selectors import get_obstacles_in_bbox
        make_report(self.user, report_status=ReportStatus.PASSIVE)
        qs = get_obstacles_in_bbox(41.0820, 29.0490, 41.0850, 29.0530, include_passive=True)
        self.assertEqual(qs.count(), 1)

    def test_excludes_reports_outside_bbox(self):
        from apps.map.selectors import get_obstacles_in_bbox
        make_report(self.user, lat="41.0900", lng="29.0600", report_status=ReportStatus.VERIFIED)
        qs = get_obstacles_in_bbox(41.0820, 29.0490, 41.0850, 29.0530)
        self.assertEqual(qs.count(), 0)

    def test_status_filter(self):
        from apps.map.selectors import get_obstacles_in_bbox
        make_report(self.user, report_status=ReportStatus.VERIFIED)
        make_report(self.user, lat="41.0840", lng="29.0510", report_status=ReportStatus.PASSIVE)
        qs = get_obstacles_in_bbox(41.0820, 29.0490, 41.0850, 29.0530, include_passive=True, status=ReportStatus.PASSIVE)
        self.assertEqual(qs.count(), 1)
        self.assertEqual(qs.first().status, ReportStatus.PASSIVE)


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

    def test_returns_obstacles_and_total(self):
        make_report(self.user, report_status=ReportStatus.VERIFIED)
        response = self.client.get(self.url, {"bbox": BBOX})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertIn("obstacles", data)
        self.assertIn("total", data)
        self.assertEqual(data["total"], 1)

    def test_response_fields(self):
        make_report(self.user, report_status=ReportStatus.VERIFIED)
        response = self.client.get(self.url, {"bbox": BBOX})
        item = response.json()["obstacles"][0]
        for field in ("reportId", "location", "category", "context", "status", "upvoteCount", "thumbnailUrl", "createdAt"):
            self.assertIn(field, item)
        self.assertIn("lat", item["location"])
        self.assertIn("lng", item["location"])

    def test_thumbnail_url_is_first_photo(self):
        report = make_report(self.user, report_status=ReportStatus.VERIFIED)
        Photo.objects.create(report=report, image_url="https://example.com/photo.jpg")
        response = self.client.get(self.url, {"bbox": BBOX})
        item = response.json()["obstacles"][0]
        self.assertEqual(item["thumbnailUrl"], "https://example.com/photo.jpg")

    def test_thumbnail_url_is_null_when_no_photos(self):
        make_report(self.user, report_status=ReportStatus.VERIFIED)
        response = self.client.get(self.url, {"bbox": BBOX})
        item = response.json()["obstacles"][0]
        self.assertIsNone(item["thumbnailUrl"])

    def test_upvote_count_in_list(self):
        report = make_report(self.user, report_status=ReportStatus.VERIFIED)
        user2 = make_user("user2@test.com")
        Interaction.objects.create(report=report, user=self.user, interaction_type=InteractionType.UPVOTE)
        Interaction.objects.create(report=report, user=user2, interaction_type=InteractionType.UPVOTE)
        response = self.client.get(self.url, {"bbox": BBOX})
        self.assertEqual(response.json()["obstacles"][0]["upvoteCount"], 2)

    def test_excludes_indoor_reports(self):
        make_report(self.user, report_status=ReportStatus.VERIFIED, context=ReportContext.INDOOR)
        response = self.client.get(self.url, {"bbox": BBOX})
        self.assertEqual(response.json()["total"], 0)

    def test_missing_bbox_returns_400(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_invalid_bbox_returns_400(self):
        response = self.client.get(self.url, {"bbox": "invalid"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_excludes_passive_by_default(self):
        make_report(self.user, report_status=ReportStatus.PASSIVE)
        response = self.client.get(self.url, {"bbox": BBOX})
        self.assertEqual(response.json()["total"], 0)

    def test_includes_passive_with_flag(self):
        make_report(self.user, report_status=ReportStatus.PASSIVE)
        response = self.client.get(self.url, {"bbox": BBOX, "includePassive": "true"})
        self.assertEqual(response.json()["total"], 1)

    def test_status_filter(self):
        make_report(self.user, report_status=ReportStatus.VERIFIED)
        make_report(self.user, lat="41.0840", lng="29.0510", report_status=ReportStatus.PASSIVE)
        response = self.client.get(self.url, {"bbox": BBOX, "includePassive": "true", "status": "PASSIVE"})
        self.assertEqual(response.json()["total"], 1)

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

    def test_returns_detail_fields(self):
        report = make_report(self.user, report_status=ReportStatus.VERIFIED)
        response = self.client.get(self._url(report.pk))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        for field in ("reportId", "location", "category", "context", "status", "description",
                      "upvoteCount", "flagCount", "photos", "statusHistory", "createdAt"):
            self.assertIn(field, data)

    def test_upvote_and_flag_count(self):
        report = make_report(self.user, report_status=ReportStatus.VERIFIED)
        user2 = make_user("user2@test.com")
        Interaction.objects.create(report=report, user=self.user, interaction_type=InteractionType.UPVOTE)
        Interaction.objects.create(report=report, user=user2, interaction_type=InteractionType.FLAG)
        response = self.client.get(self._url(report.pk))
        data = response.json()
        self.assertEqual(data["upvoteCount"], 1)
        self.assertEqual(data["flagCount"], 1)

    def test_photos_included(self):
        report = make_report(self.user, report_status=ReportStatus.VERIFIED)
        Photo.objects.create(report=report, image_url="https://example.com/photo.jpg")
        response = self.client.get(self._url(report.pk))
        photos = response.json()["photos"]
        self.assertEqual(len(photos), 1)
        self.assertEqual(photos[0]["url"], "https://example.com/photo.jpg")

    def test_status_history_included(self):
        report = make_report(self.user, report_status=ReportStatus.VERIFIED)
        StatusChange.objects.create(
            report=report,
            changed_by=self.user,
            old_status=ReportStatus.UNVERIFIED,
            new_status=ReportStatus.VERIFIED,
            reason="Looks valid.",
        )
        response = self.client.get(self._url(report.pk))
        history = response.json()["statusHistory"]
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]["oldStatus"], ReportStatus.UNVERIFIED)
        self.assertEqual(history[0]["newStatus"], ReportStatus.VERIFIED)

    def test_location_shape(self):
        report = make_report(self.user, report_status=ReportStatus.VERIFIED)
        response = self.client.get(self._url(report.pk))
        location = response.json()["location"]
        self.assertIn("lat", location)
        self.assertIn("lng", location)

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


# ---------------------------------------------------------------------------
# View: GET /api/map/search?q=...
# ---------------------------------------------------------------------------

from apps.map.models import CampusLocation


def make_location(name, aliases="", lat="41.0838", lng="29.0512", category="building"):
    return CampusLocation.objects.create(
        name=name, aliases=aliases, latitude=lat, longitude=lng, category=category,
    )


class SearchViewTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.url = "/api/map/search"

    def test_empty_query_returns_400(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_blank_query_returns_400(self):
        response = self.client.get(self.url, {"q": "   "})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_no_results_returns_empty_array(self):
        response = self.client.get(self.url, {"q": "nonexistent"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["results"], [])

    def test_search_by_name(self):
        make_location("South Campus Library", aliases="Kütüphane,Library", category="library")
        response = self.client.get(self.url, {"q": "Library"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        results = response.json()["results"]
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["name"], "South Campus Library")

    def test_search_by_turkish_alias(self):
        make_location("South Campus Library", aliases="Kütüphane,Library", category="library")
        response = self.client.get(self.url, {"q": "kütüphane"})
        results = response.json()["results"]
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["name"], "South Campus Library")

    def test_search_is_case_insensitive(self):
        make_location("Computer Engineering Building", aliases="BIM,Bilgisayar")
        response = self.client.get(self.url, {"q": "bim"})
        results = response.json()["results"]
        self.assertEqual(len(results), 1)

    def test_response_fields(self):
        make_location("South Campus Library", aliases="Kütüphane", category="library")
        response = self.client.get(self.url, {"q": "Library"})
        item = response.json()["results"][0]
        self.assertIn("name", item)
        self.assertIn("location", item)
        self.assertIn("category", item)
        self.assertIn("lat", item["location"])
        self.assertIn("lng", item["location"])

    def test_partial_match(self):
        make_location("Faculty of Engineering (ETA)", aliases="Mühendislik")
        response = self.client.get(self.url, {"q": "eng"})
        results = response.json()["results"]
        self.assertEqual(len(results), 1)

    def test_multiple_results(self):
        make_location("Electrical Engineering Building", aliases="EE,Elektrik")
        make_location("Civil Engineering Building", aliases="İnşaat")
        response = self.client.get(self.url, {"q": "engineering"})
        results = response.json()["results"]
        self.assertEqual(len(results), 2)

    def test_accessible_without_auth(self):
        response = self.client.get(self.url, {"q": "test"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
