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


# ---------------------------------------------------------------------------
# View + Service: POST /api/reports/<id>/upvote/
# ---------------------------------------------------------------------------

from uuid import uuid4

from django.test import override_settings

from apps.reports.models import Interaction, InteractionType
from apps.users.models import UserRole


@override_settings(
    AUTO_VERIFY_UPVOTE_THRESHOLD=5,
    AUTO_VERIFY_TRUSTED_UPVOTE_THRESHOLD=2,
    TRUST_SCORE_VERIFIED_DELTA=3,
    TRUSTED_REPUTATION_THRESHOLD=1000,
)
class ReportUpvoteViewTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.reporter = make_user(email="reporter@test.com")
        self.report = make_report(self.reporter, status=ReportStatus.UNVERIFIED)
        self.url = f"/api/reports/{self.report.id}/upvote/"

    def _voter(self, n):
        return make_user(email=f"voter{n}@test.com")

    def test_author_cannot_upvote_own_report_403(self):
        self.client.force_authenticate(user=self.reporter)
        response = self.client.post(self.url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertEqual(
            Interaction.objects.filter(report=self.report).count(), 0
        )

    def test_anonymous_returns_401(self):
        response = self.client.post(self.url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_unknown_report_returns_404(self):
        self.client.force_authenticate(user=self._voter(1))
        response = self.client.post(f"/api/reports/{uuid4()}/upvote/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_first_upvote_increments_and_returns_count(self):
        voter = self._voter(1)
        self.client.force_authenticate(user=voter)

        response = self.client.post(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(data["upvoteCount"], 1)
        self.assertEqual(data["status"], ReportStatus.UNVERIFIED)
        self.assertFalse(data["autoVerified"])

    def test_duplicate_upvote_is_idempotent(self):
        voter = self._voter(1)
        self.client.force_authenticate(user=voter)

        first = self.client.post(self.url)
        second = self.client.post(self.url)

        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertEqual(first.json()["upvoteCount"], 1)
        self.assertEqual(second.json()["upvoteCount"], 1)
        self.assertEqual(
            Interaction.objects.filter(
                report=self.report, interaction_type=InteractionType.UPVOTE
            ).count(),
            1,
        )

    def test_standard_reporter_transitions_above_threshold(self):
        # Threshold is 5 (strict >); 5 upvotes = stays UNVERIFIED, 6th = VERIFIED.
        for i in range(5):
            self.client.force_authenticate(user=self._voter(i))
            self.client.post(self.url)

        self.report.refresh_from_db()
        self.assertEqual(self.report.status, ReportStatus.UNVERIFIED)

        self.client.force_authenticate(user=self._voter(5))
        response = self.client.post(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(data["upvoteCount"], 6)
        self.assertEqual(data["status"], ReportStatus.VERIFIED)
        self.assertTrue(data["autoVerified"])

        self.report.refresh_from_db()
        self.assertEqual(self.report.status, ReportStatus.VERIFIED)
        self.reporter.refresh_from_db()
        self.assertEqual(self.reporter.reputation_points, 3)

    def test_trusted_reporter_transitions_at_lower_threshold(self):
        self.reporter.role = UserRole.TRUSTED_CONTRIBUTOR
        self.reporter.save(update_fields=['role'])

        # Trusted threshold is 2 (strict >); 2 upvotes = stays, 3rd = VERIFIED.
        for i in range(2):
            self.client.force_authenticate(user=self._voter(i))
            self.client.post(self.url)

        self.report.refresh_from_db()
        self.assertEqual(self.report.status, ReportStatus.UNVERIFIED)

        self.client.force_authenticate(user=self._voter(2))
        response = self.client.post(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(data["upvoteCount"], 3)
        self.assertEqual(data["status"], ReportStatus.VERIFIED)
        self.assertTrue(data["autoVerified"])

    def test_standard_reporter_does_not_transition_at_trusted_threshold(self):
        # 3 upvotes is enough for trusted, but reporter is REGISTERED_USER -> still UNVERIFIED.
        for i in range(3):
            self.client.force_authenticate(user=self._voter(i))
            response = self.client.post(self.url)

        data = response.json()
        self.assertEqual(data["upvoteCount"], 3)
        self.assertEqual(data["status"], ReportStatus.UNVERIFIED)
        self.assertFalse(data["autoVerified"])

    def test_no_double_transition_after_verified(self):
        # Once VERIFIED, further upvotes don't re-trigger the transition or re-award score.
        for i in range(6):
            self.client.force_authenticate(user=self._voter(i))
            self.client.post(self.url)

        self.reporter.refresh_from_db()
        self.assertEqual(self.reporter.reputation_points, 3)

        self.client.force_authenticate(user=self._voter(6))
        response = self.client.post(self.url)

        self.assertEqual(response.json()["upvoteCount"], 7)
        self.assertEqual(response.json()["status"], ReportStatus.VERIFIED)
        self.assertFalse(response.json()["autoVerified"])
        self.reporter.refresh_from_db()
        self.assertEqual(self.reporter.reputation_points, 3)
