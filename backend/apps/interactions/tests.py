import uuid

from django.test import TestCase, override_settings
from rest_framework import status
from rest_framework.exceptions import NotFound, PermissionDenied
from rest_framework.test import APIClient

from apps.reports.models import (
    Interaction,
    InteractionType,
    ObstacleCategory,
    Report,
    ReportContext,
    ReportStatus,
)
from apps.users.models import User


def make_user(email="user@test.com", **kwargs):
    return User.objects.create_user(
        email=email, full_name="Test User", password="pass", **kwargs
    )


def make_report(reporter, **kwargs):
    defaults = dict(
        title="Broken Ramp",
        description="The ramp is broken.",
        category=ObstacleCategory.BROKEN_RAMP,
        context=ReportContext.OUTDOOR,
        status=ReportStatus.VERIFIED,
        latitude="41.083700",
        longitude="29.051000",
    )
    defaults.update(kwargs)
    return Report.objects.create(reporter=reporter, **defaults)


# ---------------------------------------------------------------------------
# Service: upvote_report
# ---------------------------------------------------------------------------


class UpvoteReportServiceTest(TestCase):
    def setUp(self):
        self.reporter = make_user(email="reporter@test.com")
        self.voter = make_user(email="voter@test.com")
        self.report = make_report(self.reporter)

    def test_upvote_creates_interaction(self):
        from apps.interactions.services import upvote_report

        result = upvote_report(self.voter, self.report.pk)

        self.assertEqual(result["upvoteCount"], 1)
        self.assertTrue(
            Interaction.objects.filter(
                report=self.report,
                user=self.voter,
                interaction_type=InteractionType.UPVOTE,
            ).exists()
        )

    def test_upvote_idempotent_no_double_count(self):
        from apps.interactions.services import upvote_report

        upvote_report(self.voter, self.report.pk)
        result = upvote_report(self.voter, self.report.pk)

        self.assertEqual(result["upvoteCount"], 1)
        self.assertEqual(
            Interaction.objects.filter(
                report=self.report, interaction_type=InteractionType.UPVOTE
            ).count(),
            1,
        )

    def test_cannot_upvote_own_report(self):
        from apps.interactions.services import upvote_report

        with self.assertRaises(PermissionDenied):
            upvote_report(self.reporter, self.report.pk)

    def test_upvote_count_increments_per_distinct_user(self):
        from apps.interactions.services import upvote_report

        voter2 = make_user(email="voter2@test.com")
        upvote_report(self.voter, self.report.pk)
        result = upvote_report(voter2, self.report.pk)

        self.assertEqual(result["upvoteCount"], 2)

    def test_nonexistent_report_raises_not_found(self):
        from apps.interactions.services import upvote_report

        with self.assertRaises(NotFound):
            upvote_report(self.voter, uuid.uuid4())

    @override_settings(UPVOTE_THRESHOLD=3)
    def test_confirmed_transition_at_threshold(self):
        from apps.interactions.services import upvote_report

        voters = [make_user(email=f"v{i}@test.com") for i in range(3)]

        for voter in voters[:2]:
            result = upvote_report(voter, self.report.pk)
            self.assertNotEqual(result["status"], ReportStatus.CONFIRMED)

        result = upvote_report(voters[2], self.report.pk)
        self.assertEqual(result["status"], ReportStatus.CONFIRMED)

        self.report.refresh_from_db()
        self.assertEqual(self.report.status, ReportStatus.CONFIRMED)

    @override_settings(UPVOTE_THRESHOLD=3)
    def test_no_double_transition_on_idempotent_upvote(self):
        from apps.interactions.services import upvote_report

        voters = [make_user(email=f"v{i}@test.com") for i in range(3)]
        for voter in voters:
            upvote_report(voter, self.report.pk)

        self.report.status = ReportStatus.VERIFIED
        self.report.save()

        result = upvote_report(voters[0], self.report.pk)
        self.assertEqual(result["status"], ReportStatus.VERIFIED)


# ---------------------------------------------------------------------------
# View: POST /api/reports/{id}/upvote/
# ---------------------------------------------------------------------------


class ReportUpvoteViewTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.reporter = make_user(email="reporter@test.com")
        self.voter = make_user(email="voter@test.com")
        self.report = make_report(self.reporter)
        self.url = f"/api/reports/{self.report.pk}/upvote/"

    def test_upvote_returns_200_with_expected_fields(self):
        self.client.force_authenticate(user=self.voter)
        response = self.client.post(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertIn("reportId", data)
        self.assertIn("upvoteCount", data)
        self.assertIn("status", data)
        self.assertEqual(data["upvoteCount"], 1)

    def test_unauthenticated_returns_401(self):
        response = self.client.post(self.url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_own_report_returns_403(self):
        self.client.force_authenticate(user=self.reporter)
        response = self.client.post(self.url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_idempotent_upvote_returns_200(self):
        self.client.force_authenticate(user=self.voter)
        self.client.post(self.url)
        response = self.client.post(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["upvoteCount"], 1)

    def test_nonexistent_report_returns_404(self):
        self.client.force_authenticate(user=self.voter)
        response = self.client.post(f"/api/reports/{uuid.uuid4()}/upvote/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    @override_settings(UPVOTE_THRESHOLD=1)
    def test_upvote_triggers_confirmed_status(self):
        self.client.force_authenticate(user=self.voter)
        response = self.client.post(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["status"], ReportStatus.CONFIRMED)
