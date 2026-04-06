import base64
from decimal import Decimal
from unittest.mock import patch, MagicMock

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.users.models import User
from apps.reports.models import Report, Photo, ReportStatus
from apps.reports.services import (
    detect_duplicate,
    auto_verify,
    VERIFICATION_THRESHOLD,
)

FAKE_PHOTO = "data:image/jpeg;base64," + base64.b64encode(b"\xff\xd8fake").decode()


def _create_user(email="user@test.com", reputation_points=0):
    return User.objects.create_user(
        email=email,
        full_name="Test User",
        password="SecureP@ss123",
        reputation_points=reputation_points,
    )


def _auth_client(user):
    client = APIClient()
    client.force_authenticate(user=user)
    return client


MOCK_SUPABASE_PATH = "apps.reports.services.create_client"


def _mock_supabase():
    """Return a mock that fakes Supabase storage upload + public URL."""
    mock_client = MagicMock()
    bucket = mock_client.storage.from_.return_value
    bucket.upload.return_value = None
    bucket.get_public_url.return_value = "https://storage.example.com/photo.jpg"
    return mock_client


class ReportCreateViewTest(TestCase):
    def setUp(self):
        self.user = _create_user()
        self.client = _auth_client(self.user)
        self.url = "/api/reports/"
        self.valid_payload = {
            "location": {"lat": 41.0843, "lng": 29.0510},
            "context": "OUTDOOR",
            "category": "BROKEN_RAMP",
            "description": "Broken ramp at building entrance",
            "photos": [FAKE_PHOTO],
        }

    @patch(MOCK_SUPABASE_PATH, return_value=_mock_supabase())
    def test_create_report_success(self, mock_sb):
        response = self.client.post(self.url, self.valid_payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        data = response.json()
        self.assertIn("reportId", data)
        self.assertEqual(data["status"], "UNVERIFIED")
        self.assertFalse(data["autoVerified"])
        self.assertIsNone(data["duplicateCandidate"])
        self.assertIn("createdAt", data)

    @patch(MOCK_SUPABASE_PATH, return_value=_mock_supabase())
    def test_photo_saved_in_db(self, mock_sb):
        self.client.post(self.url, self.valid_payload, format="json")
        report = Report.objects.first()
        self.assertEqual(Photo.objects.filter(report=report).count(), 1)

    def test_missing_photos_returns_400(self):
        payload = {**self.valid_payload}
        del payload["photos"]
        response = self.client.post(self.url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_empty_photos_returns_400(self):
        payload = {**self.valid_payload, "photos": []}
        response = self.client.post(self.url, payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unauthenticated_returns_401(self):
        client = APIClient()
        response = client.post(self.url, self.valid_payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class DetectDuplicateTest(TestCase):
    def setUp(self):
        self.user = _create_user()

    def test_no_duplicate_when_no_nearby_reports(self):
        report = Report.objects.create(
            reporter=self.user,
            title="Test",
            description="",
            category="BROKEN_RAMP",
            context="OUTDOOR",
            latitude=Decimal("41.084300"),
            longitude=Decimal("29.051000"),
            status=ReportStatus.UNVERIFIED,
        )
        result = detect_duplicate(report)
        self.assertIsNone(result)

    def test_duplicate_found_within_20m(self):
        existing = Report.objects.create(
            reporter=self.user,
            title="Existing",
            description="",
            category="BROKEN_RAMP",
            context="OUTDOOR",
            latitude=Decimal("41.084300"),
            longitude=Decimal("29.051000"),
            status=ReportStatus.UNVERIFIED,
        )
        new_report = Report.objects.create(
            reporter=self.user,
            title="New",
            description="",
            category="BROKEN_RAMP",
            context="OUTDOOR",
            latitude=Decimal("41.084390"),
            longitude=Decimal("29.051000"),
            status=ReportStatus.UNVERIFIED,
        )
        result = detect_duplicate(new_report)
        self.assertIsNotNone(result)
        self.assertEqual(result["reportId"], str(existing.id))
        self.assertIn("distance", result)
        self.assertLessEqual(result["distance"], 20.0)

    def test_no_duplicate_beyond_20m(self):
        Report.objects.create(
            reporter=self.user,
            title="Far",
            description="",
            category="BROKEN_RAMP",
            context="OUTDOOR",
            latitude=Decimal("41.085000"),
            longitude=Decimal("29.051000"),
            status=ReportStatus.UNVERIFIED,
        )
        new_report = Report.objects.create(
            reporter=self.user,
            title="New",
            description="",
            category="BROKEN_RAMP",
            context="OUTDOOR",
            latitude=Decimal("41.084300"),
            longitude=Decimal("29.051000"),
            status=ReportStatus.UNVERIFIED,
        )
        result = detect_duplicate(new_report)
        self.assertIsNone(result)

    def test_closed_report_not_duplicate(self):
        Report.objects.create(
            reporter=self.user,
            title="Closed",
            description="",
            category="BROKEN_RAMP",
            context="OUTDOOR",
            latitude=Decimal("41.084300"),
            longitude=Decimal("29.051000"),
            status=ReportStatus.CLOSED,
        )
        new_report = Report.objects.create(
            reporter=self.user,
            title="New",
            description="",
            category="BROKEN_RAMP",
            context="OUTDOOR",
            latitude=Decimal("41.084300"),
            longitude=Decimal("29.051000"),
            status=ReportStatus.UNVERIFIED,
        )
        result = detect_duplicate(new_report)
        self.assertIsNone(result)


class AutoVerifyTest(TestCase):
    def test_low_trust_not_verified(self):
        user = _create_user(reputation_points=50)
        report = Report.objects.create(
            reporter=user,
            title="Test",
            description="",
            category="BROKEN_RAMP",
            context="OUTDOOR",
            latitude=Decimal("41.084300"),
            longitude=Decimal("29.051000"),
            status=ReportStatus.UNVERIFIED,
        )
        result = auto_verify(report)
        self.assertFalse(result)
        report.refresh_from_db()
        self.assertEqual(report.status, ReportStatus.UNVERIFIED)

    def test_high_trust_auto_verified(self):
        user = _create_user(
            email="trusted@test.com",
            reputation_points=VERIFICATION_THRESHOLD,
        )
        report = Report.objects.create(
            reporter=user,
            title="Test",
            description="",
            category="BROKEN_RAMP",
            context="OUTDOOR",
            latitude=Decimal("41.084300"),
            longitude=Decimal("29.051000"),
            status=ReportStatus.UNVERIFIED,
        )
        result = auto_verify(report)
        self.assertTrue(result)
        report.refresh_from_db()
        self.assertEqual(report.status, ReportStatus.VERIFIED)

    @patch(MOCK_SUPABASE_PATH, return_value=_mock_supabase())
    def test_auto_verified_response(self, mock_sb):
        user = _create_user(
            email="trusted2@test.com",
            reputation_points=VERIFICATION_THRESHOLD,
        )
        client = _auth_client(user)
        payload = {
            "location": {"lat": 41.0843, "lng": 29.0510},
            "context": "OUTDOOR",
            "category": "BROKEN_RAMP",
            "description": "Test",
            "photos": [FAKE_PHOTO],
        }
        response = client.post("/api/reports/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        data = response.json()
        self.assertTrue(data["autoVerified"])
        self.assertEqual(data["status"], "VERIFIED")


class DuplicateResponseTest(TestCase):
    @patch(MOCK_SUPABASE_PATH, return_value=_mock_supabase())
    def test_duplicate_candidate_in_response(self, mock_sb):
        user = _create_user()
        Report.objects.create(
            reporter=user,
            title="Existing",
            description="",
            category="BROKEN_RAMP",
            context="OUTDOOR",
            latitude=Decimal("41.084300"),
            longitude=Decimal("29.051000"),
            status=ReportStatus.UNVERIFIED,
        )
        client = _auth_client(user)
        payload = {
            "location": {"lat": 41.08435, "lng": 29.0510},
            "context": "OUTDOOR",
            "category": "BROKEN_RAMP",
            "description": "Near duplicate",
            "photos": [FAKE_PHOTO],
        }
        response = client.post("/api/reports/", payload, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        data = response.json()
        self.assertIsNotNone(data["duplicateCandidate"])
        self.assertIn("reportId", data["duplicateCandidate"])
        self.assertIn("distance", data["duplicateCandidate"])
