from unittest.mock import patch, MagicMock

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.users.models import User
from apps.reports.models import Report, Photo, ReportStatus, ObstacleCategory, ReportContext


def make_user(email="user@test.com"):
    return User.objects.create_user(email=email, full_name="Test User", password="pass")


def make_report(reporter, **kwargs):
    defaults = dict(
        title="Broken Ramp",
        description="The ramp is broken.",
        category=ObstacleCategory.BROKEN_RAMP,
        context=ReportContext.OUTDOOR,
        status=ReportStatus.UNVERIFIED,
        latitude="41.083700",
        longitude="29.051000",
    )
    defaults.update(kwargs)
    return Report.objects.create(reporter=reporter, **defaults)


# ---------------------------------------------------------------------------
# Service: create_report
# ---------------------------------------------------------------------------

class CreateReportServiceTest(TestCase):
    def setUp(self):
        self.user = make_user()

    @patch("apps.reports.services._get_supabase_client")
    def test_creates_report_in_db(self, mock_client):
        mock_storage = MagicMock()
        mock_storage.from_().upload.return_value = {}
        mock_storage.from_().get_public_url.return_value = "https://example.com/photo.jpg"
        mock_client.return_value.storage = mock_storage

        from apps.reports.services import create_report

        data = {
            "location": {"lat": "41.083700", "lng": "29.051000"},
            "context": ReportContext.OUTDOOR,
            "category": ObstacleCategory.BROKEN_RAMP,
            "description": "Broken ramp near entrance.",
            "photos": [],
        }
        report = create_report(self.user, data)

        self.assertIsNotNone(report.pk)
        self.assertEqual(report.reporter, self.user)
        self.assertEqual(report.status, ReportStatus.VERIFIED)
        self.assertEqual(report.category, ObstacleCategory.BROKEN_RAMP)

    @patch("apps.reports.services._get_supabase_client")
    def test_photo_upload_and_db_record(self, mock_client):
        mock_storage = MagicMock()
        mock_storage.from_().upload.return_value = {}
        mock_storage.from_().get_public_url.return_value = "https://example.com/photo.jpg"
        mock_client.return_value.storage = mock_storage

        from apps.reports.services import create_report

        data = {
            "location": {"lat": "41.083700", "lng": "29.051000"},
            "context": ReportContext.OUTDOOR,
            "category": ObstacleCategory.BROKEN_RAMP,
            "description": "",
            "photos": ["data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2Q=="],
        }
        report = create_report(self.user, data)

        self.assertEqual(Photo.objects.filter(report=report).count(), 1)
        self.assertEqual(Photo.objects.get(report=report).image_url, "https://example.com/photo.jpg")

    @patch("apps.reports.services._get_supabase_client")
    def test_rollback_on_upload_failure(self, mock_client):
        mock_storage = MagicMock()
        mock_storage.from_().upload.side_effect = Exception("Supabase error")
        mock_client.return_value.storage = mock_storage

        from apps.reports.services import create_report

        initial_report_count = Report.objects.count()
        initial_photo_count = Photo.objects.count()

        data = {
            "location": {"lat": "41.083700", "lng": "29.051000"},
            "context": ReportContext.OUTDOOR,
            "category": ObstacleCategory.BROKEN_RAMP,
            "description": "",
            "photos": ["data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2Q=="],
        }
        with self.assertRaises(Exception):
            create_report(self.user, data)

        self.assertEqual(Report.objects.count(), initial_report_count)
        self.assertEqual(Photo.objects.count(), initial_photo_count)

    @patch("apps.reports.services._get_supabase_client")
    def test_title_generated_from_category(self, mock_client):
        mock_client.return_value.storage = MagicMock()

        from apps.reports.services import create_report

        data = {
            "location": {"lat": "41.083700", "lng": "29.051000"},
            "context": ReportContext.OUTDOOR,
            "category": ObstacleCategory.NARROW_SIDEWALK,
            "description": "",
            "photos": [],
        }
        report = create_report(self.user, data)
        self.assertEqual(report.title, "Narrow Sidewalk")


# ---------------------------------------------------------------------------
# Serializer: ReportSerializer
# ---------------------------------------------------------------------------

class ReportSerializerTest(TestCase):
    def _valid_payload(self, **overrides):
        base = {
            "location": {"lat": "41.083700", "lng": "29.051000"},
            "context": "OUTDOOR",
            "category": "BROKEN_RAMP",
            "description": "Some description.",
            "photos": ["data:image/jpeg;base64,abc123"],
        }
        base.update(overrides)
        return base

    def test_valid_payload(self):
        from apps.reports.serializers import ReportSerializer
        s = ReportSerializer(data=self._valid_payload())
        self.assertTrue(s.is_valid(), s.errors)

    def test_missing_location(self):
        from apps.reports.serializers import ReportSerializer
        payload = self._valid_payload()
        del payload["location"]
        s = ReportSerializer(data=payload)
        self.assertFalse(s.is_valid())
        self.assertIn("location", s.errors)

    def test_missing_context(self):
        from apps.reports.serializers import ReportSerializer
        payload = self._valid_payload()
        del payload["context"]
        s = ReportSerializer(data=payload)
        self.assertFalse(s.is_valid())
        self.assertIn("context", s.errors)

    def test_invalid_context_choice(self):
        from apps.reports.serializers import ReportSerializer
        s = ReportSerializer(data=self._valid_payload(context="INVALID"))
        self.assertFalse(s.is_valid())
        self.assertIn("context", s.errors)

    def test_photos_required(self):
        from apps.reports.serializers import ReportSerializer
        payload = self._valid_payload()
        del payload["photos"]
        s = ReportSerializer(data=payload)
        self.assertFalse(s.is_valid())
        self.assertIn("photos", s.errors)

    def test_photos_max_3(self):
        from apps.reports.serializers import ReportSerializer
        payload = self._valid_payload(photos=["a", "b", "c", "d"])
        s = ReportSerializer(data=payload)
        self.assertFalse(s.is_valid())
        self.assertIn("photos", s.errors)

    def test_photos_min_1(self):
        from apps.reports.serializers import ReportSerializer
        payload = self._valid_payload(photos=[])
        s = ReportSerializer(data=payload)
        self.assertFalse(s.is_valid())
        self.assertIn("photos", s.errors)

    def test_category_optional(self):
        from apps.reports.serializers import ReportSerializer
        payload = self._valid_payload()
        del payload["category"]
        s = ReportSerializer(data=payload)
        self.assertTrue(s.is_valid(), s.errors)

    def test_description_optional(self):
        from apps.reports.serializers import ReportSerializer
        payload = self._valid_payload()
        del payload["description"]
        s = ReportSerializer(data=payload)
        self.assertTrue(s.is_valid(), s.errors)


# ---------------------------------------------------------------------------
# View: POST /api/reports/
# ---------------------------------------------------------------------------

class ReportCreateViewTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.url = "/api/reports/"
        self.user = make_user()
        self.client.force_authenticate(user=self.user)

    def _valid_payload(self):
        return {
            "location": {"lat": "41.083700", "lng": "29.051000"},
            "context": "OUTDOOR",
            "category": "BROKEN_RAMP",
            "description": "Broken ramp.",
            "photos": ["data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2Q=="],
        }

    @patch("apps.reports.services._get_supabase_client")
    def test_create_report_returns_201(self, mock_client):
        mock_storage = MagicMock()
        mock_storage.from_().upload.return_value = {}
        mock_storage.from_().get_public_url.return_value = "https://example.com/photo.jpg"
        mock_client.return_value.storage = mock_storage

        response = self.client.post(self.url, self._valid_payload(), format="json")

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        data = response.json()
        self.assertIn("reportId", data)
        self.assertIn("status", data)
        self.assertIn("autoVerified", data)
        self.assertIn("duplicateCandidate", data)
        self.assertIn("createdAt", data)
        self.assertEqual(data["status"], ReportStatus.VERIFIED)
        self.assertFalse(data["autoVerified"])
        self.assertIsNone(data["duplicateCandidate"])

    def test_unauthenticated_returns_401(self):
        self.client.logout()
        response = self.client.post(self.url, self._valid_payload(), format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_invalid_payload_returns_400(self):
        response = self.client.post(self.url, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
