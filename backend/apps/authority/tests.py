from uuid import uuid4

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.notifications.models import Notification, NotificationType
from apps.reports.models import (
    Interaction,
    InteractionType,
    ObstacleCategory,
    Report,
    ReportContext,
    ReportStatus,
    StatusChange,
)
from apps.users.models import User, UserRole


def make_user(email, role=UserRole.REGISTERED_USER, **kwargs):
    return User.objects.create_user(
        email=email,
        full_name=kwargs.pop('full_name', 'Test User'),
        password='pass',
        role=role,
        **kwargs,
    )


def make_report(reporter, **kwargs):
    defaults = dict(
        title="Broken Ramp",
        description="Broken.",
        category=ObstacleCategory.BROKEN_RAMP,
        context=ReportContext.OUTDOOR,
        status=ReportStatus.VERIFIED,
        latitude="41.083700",
        longitude="29.051000",
    )
    defaults.update(kwargs)
    return Report.objects.create(reporter=reporter, **defaults)


class ResolveReportViewTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.authority = make_user("authority@test.com", role=UserRole.INFRASTRUCTURE_AUTHORITY)
        self.reporter = make_user("reporter@test.com")
        self.report = make_report(self.reporter)
        self.url = f"/api/authority/reports/{self.report.id}/resolve"
        self.payload = {
            "repairPhotoUrl": "https://cdn.example.com/repaired.jpg",
            "repairNotes": "Patched the ramp.",
        }

    def test_anonymous_returns_401(self):
        response = self.client.patch(self.url, self.payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_non_authority_role_returns_403(self):
        self.client.force_authenticate(user=self.reporter)  # REGISTERED_USER
        response = self.client.patch(self.url, self.payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_role_returns_403(self):
        admin = make_user("admin@test.com", role=UserRole.ADMINISTRATOR)
        self.client.force_authenticate(user=admin)
        response = self.client.patch(self.url, self.payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_missing_repair_photo_url_returns_400(self):
        self.client.force_authenticate(user=self.authority)
        response = self.client.patch(
            self.url, {"repairNotes": "no photo"}, format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("repairPhotoUrl", response.content.decode())
        self.report.refresh_from_db()
        self.assertEqual(self.report.status, ReportStatus.VERIFIED)

    def test_invalid_url_returns_400(self):
        self.client.force_authenticate(user=self.authority)
        response = self.client.patch(
            self.url,
            {"repairPhotoUrl": "not-a-url", "repairNotes": "x"},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_unknown_report_returns_404(self):
        self.client.force_authenticate(user=self.authority)
        response = self.client.patch(
            f"/api/authority/reports/{uuid4()}/resolve",
            self.payload,
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_successful_transition_records_status_change_and_returns_200(self):
        self.client.force_authenticate(user=self.authority)

        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.patch(self.url, self.payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        body = response.json()
        self.assertEqual(body["status"], ReportStatus.RESOLVED_AWAITING_VALIDATION)
        self.assertEqual(body["reportId"], str(self.report.id))

        self.report.refresh_from_db()
        self.assertEqual(self.report.status, ReportStatus.RESOLVED_AWAITING_VALIDATION)

        change = StatusChange.objects.get(report=self.report)
        self.assertEqual(change.changed_by, self.authority)
        self.assertEqual(change.old_status, ReportStatus.VERIFIED)
        self.assertEqual(change.new_status, ReportStatus.RESOLVED_AWAITING_VALIDATION)
        self.assertIn("repair_photo_url: https://cdn.example.com/repaired.jpg", change.reason)
        self.assertIn("notes: Patched the ramp.", change.reason)

    def test_resolve_notifies_reporter_and_upvoters(self):
        u1 = make_user("u1@test.com")
        u2 = make_user("u2@test.com")
        Interaction.objects.create(
            report=self.report, user=u1, interaction_type=InteractionType.UPVOTE,
        )
        Interaction.objects.create(
            report=self.report, user=u2, interaction_type=InteractionType.UPVOTE,
        )

        self.client.force_authenticate(user=self.authority)
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.patch(self.url, self.payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_200_OK)

        recipients = set(
            Notification.objects.filter(
                related_report=self.report,
                notification_type=NotificationType.REPORT_RESOLVED,
            ).values_list('user_id', flat=True)
        )
        self.assertEqual(recipients, {self.reporter.id, u1.id, u2.id})

    def test_resolve_skips_users_with_notifications_disabled(self):
        u1 = make_user("u1@test.com", notifications_enabled=False)
        u2 = make_user("u2@test.com", notifications_enabled=True)
        Interaction.objects.create(
            report=self.report, user=u1, interaction_type=InteractionType.UPVOTE,
        )
        Interaction.objects.create(
            report=self.report, user=u2, interaction_type=InteractionType.UPVOTE,
        )

        self.client.force_authenticate(user=self.authority)
        with self.captureOnCommitCallbacks(execute=True):
            self.client.patch(self.url, self.payload, format='json')

        recipients = set(
            Notification.objects.filter(
                related_report=self.report,
            ).values_list('user_id', flat=True)
        )
        self.assertEqual(recipients, {self.reporter.id, u2.id})

    def test_already_resolved_returns_409(self):
        self.report.status = ReportStatus.RESOLVED_AWAITING_VALIDATION
        self.report.save(update_fields=['status'])

        self.client.force_authenticate(user=self.authority)
        response = self.client.patch(self.url, self.payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)
