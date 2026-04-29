from unittest.mock import patch
from uuid import uuid4

from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.test import APIClient

from apps.reports.models import (
    ObstacleCategory,
    Report,
    ReportContext,
    ReportStatus,
)
from apps.users.models import User, UserRole


def make_admin(email="admin@test.com"):
    return User.objects.create_user(
        email=email,
        full_name="Admin",
        password="pass",
        role=UserRole.ADMINISTRATOR,
    )


def make_reporter(email="reporter@test.com", points=0):
    user = User.objects.create_user(
        email=email, full_name="Reporter", password="pass",
    )
    if points:
        user.reputation_points = points
        user.save(update_fields=['reputation_points'])
    return user


def make_report(reporter):
    return Report.objects.create(
        reporter=reporter,
        title="Broken Ramp",
        description="The ramp is broken.",
        category=ObstacleCategory.BROKEN_RAMP,
        context=ReportContext.OUTDOOR,
        status=ReportStatus.VERIFIED,
        latitude="41.083700",
        longitude="29.051000",
    )


# ---------------------------------------------------------------------------
# View: DELETE /api/admin/reports/<uuid>/
# ---------------------------------------------------------------------------

@override_settings(TRUST_SCORE_MALICIOUS_DELTA=4)
class DeleteReportAsMaliciousViewTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = make_admin()
        self.reporter = make_reporter(points=10)
        self.report = make_report(self.reporter)
        self.url = f"/api/admin/reports/{self.report.id}/"

    def test_admin_deletes_and_decrements_score(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.delete(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(Report.objects.filter(pk=self.report.id).exists())
        self.reporter.refresh_from_db()
        self.assertEqual(self.reporter.reputation_points, 6)
        self.assertEqual(response.json()['trust_score'], 6)

    def test_non_admin_gets_403(self):
        other = User.objects.create_user(
            email="other@test.com", full_name="Other", password="pass",
        )
        self.client.force_authenticate(user=other)

        response = self.client.delete(self.url)

        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.assertTrue(Report.objects.filter(pk=self.report.id).exists())
        self.reporter.refresh_from_db()
        self.assertEqual(self.reporter.reputation_points, 10)

    def test_anonymous_gets_401(self):
        response = self.client.delete(self.url)

        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertTrue(Report.objects.filter(pk=self.report.id).exists())

    def test_unknown_report_returns_404(self):
        self.client.force_authenticate(user=self.admin)

        response = self.client.delete(f"/api/admin/reports/{uuid4()}/")

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_decrement_floors_at_zero(self):
        self.reporter.reputation_points = 2
        self.reporter.save(update_fields=['reputation_points'])
        self.client.force_authenticate(user=self.admin)

        response = self.client.delete(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.reporter.refresh_from_db()
        self.assertEqual(self.reporter.reputation_points, 0)
        self.assertEqual(response.json()['trust_score'], 0)


# ---------------------------------------------------------------------------
# Service: delete_report_as_malicious
# ---------------------------------------------------------------------------

@override_settings(TRUST_SCORE_MALICIOUS_DELTA=4)
class DeleteReportAsMaliciousServiceTest(TestCase):
    def setUp(self):
        self.reporter = make_reporter(points=10)
        self.report = make_report(self.reporter)

    def test_deletes_and_decrements(self):
        from apps.admin.services import delete_report_as_malicious

        result = delete_report_as_malicious(self.report.id)

        self.assertEqual(result['trust_score'], 6)
        self.assertEqual(result['reporter_id'], self.reporter.pk)
        self.assertFalse(Report.objects.filter(pk=self.report.id).exists())
        self.reporter.refresh_from_db()
        self.assertEqual(self.reporter.reputation_points, 6)

    def test_unknown_raises_does_not_exist(self):
        from apps.admin.services import delete_report_as_malicious

        with self.assertRaises(Report.DoesNotExist):
            delete_report_as_malicious(uuid4())

    def test_rollback_on_delete_failure(self):
        from apps.admin.services import delete_report_as_malicious

        with patch.object(Report, 'delete', side_effect=Exception("boom")):
            with self.assertRaises(Exception):
                delete_report_as_malicious(self.report.id)

        self.reporter.refresh_from_db()
        self.assertEqual(self.reporter.reputation_points, 10)
        self.assertTrue(Report.objects.filter(pk=self.report.id).exists())
