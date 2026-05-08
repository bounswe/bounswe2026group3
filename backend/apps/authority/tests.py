from unittest.mock import patch
from uuid import uuid4

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.notifications.models import Notification, NotificationType
from apps.reports.models import (
    Interaction,
    InteractionType,
    ObstacleCategory,
    Photo,
    Report,
    ReportContext,
    ReportStatus,
    StatusChange,
)
from apps.users.models import User, UserRole


# Tiny 1x1 PNG, base64-encoded.
SAMPLE_BASE64_PNG = (
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
)


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


def _fake_save_photos(report, photos):
    """Stub save_photos so resolve tests don't hit Supabase."""
    return [
        Photo.objects.create(report=report, image_url=f'https://cdn.fake/{report.id}-{i}.jpg')
        for i, _ in enumerate(photos)
    ]


class ResolveReportViewTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.authority = make_user("authority@test.com", role=UserRole.INFRASTRUCTURE_AUTHORITY)
        self.reporter = make_user("reporter@test.com")
        self.report = make_report(self.reporter)
        self.url = f"/api/authority/reports/{self.report.id}/resolve"
        self.payload = {
            "repairPhoto": SAMPLE_BASE64_PNG,
            "repairNotes": "Patched the ramp.",
        }
        self._save_photos_patch = patch(
            'apps.authority.services.save_photos',
            side_effect=_fake_save_photos,
        )
        self._save_photos_patch.start()
        self.addCleanup(self._save_photos_patch.stop)

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

    def test_missing_repair_photo_returns_400(self):
        self.client.force_authenticate(user=self.authority)
        response = self.client.patch(
            self.url, {"repairNotes": "no photo"}, format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("repairPhoto", response.content.decode())
        self.report.refresh_from_db()
        self.assertEqual(self.report.status, ReportStatus.VERIFIED)

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
        self.assertTrue(body["repairPhotoUrl"].startswith('https://cdn.fake/'))

        self.report.refresh_from_db()
        self.assertEqual(self.report.status, ReportStatus.RESOLVED_AWAITING_VALIDATION)
        self.assertEqual(self.report.photos.count(), 1)

        change = StatusChange.objects.get(report=self.report)
        self.assertEqual(change.changed_by, self.authority)
        self.assertEqual(change.old_status, ReportStatus.VERIFIED)
        self.assertEqual(change.new_status, ReportStatus.RESOLVED_AWAITING_VALIDATION)
        self.assertIn("repair_photo_url: https://cdn.fake/", change.reason)
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


class DashboardViewTest(TestCase):
    def setUp(self):
        # Project conftest disables django_db_setup, so the DB isn't reset
        # between test classes. Wipe Reports to keep these assertions stable.
        Report.objects.all().delete()

        self.client = APIClient()
        self.authority = make_user("authority@test.com", role=UserRole.INFRASTRUCTURE_AUTHORITY)
        self.reporter = make_user("reporter@test.com")
        self.url = "/api/authority/dashboard"

        # Build a representative spread of report statuses.
        self.verified = make_report(self.reporter, status=ReportStatus.VERIFIED)
        self.awaiting = make_report(self.reporter, status=ReportStatus.RESOLVED_AWAITING_VALIDATION)
        self.closed = make_report(self.reporter, status=ReportStatus.CLOSED)
        # These should NOT appear on the dashboard.
        make_report(self.reporter, status=ReportStatus.UNVERIFIED)
        make_report(self.reporter, status=ReportStatus.PASSIVE)

    def test_anonymous_returns_401(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_non_authority_returns_403(self):
        self.client.force_authenticate(user=self.reporter)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_authority_lists_only_dashboard_statuses(self):
        self.client.force_authenticate(user=self.authority)
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        body = response.json()

        ids = {item["reportId"] for item in body["reports"]}
        self.assertEqual(ids, {str(self.verified.id), str(self.awaiting.id), str(self.closed.id)})

        self.assertEqual(body["counts"], {
            "verified": 1,
            "awaitingValidation": 1,
            "closed": 1,
            "total": 3,
        })

    def test_filter_by_status_verified(self):
        self.client.force_authenticate(user=self.authority)
        response = self.client.get(self.url, {"status": ReportStatus.VERIFIED})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        body = response.json()
        ids = {item["reportId"] for item in body["reports"]}
        self.assertEqual(ids, {str(self.verified.id)})
        # Counts are unaffected by the status filter.
        self.assertEqual(body["counts"]["total"], 3)

    def test_pagination(self):
        # Add extra verified reports to exceed page size.
        for _ in range(4):
            make_report(self.reporter, status=ReportStatus.VERIFIED)

        self.client.force_authenticate(user=self.authority)
        response = self.client.get(
            self.url, {"status": ReportStatus.VERIFIED, "page": 2, "size": 2}
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        body = response.json()
        self.assertEqual(len(body["reports"]), 2)
        self.assertEqual(body["pagination"], {
            "page": 2, "size": 2, "totalItems": 5,
        })

    def test_invalid_pagination_returns_400(self):
        self.client.force_authenticate(user=self.authority)
        response = self.client.get(self.url, {"page": "abc"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_response_includes_location_and_reporter(self):
        self.client.force_authenticate(user=self.authority)
        response = self.client.get(self.url, {"status": ReportStatus.VERIFIED})
        item = response.json()["reports"][0]
        self.assertEqual(item["location"], {"lat": 41.0837, "lng": 29.051})
        self.assertEqual(item["reporter"]["userId"], str(self.reporter.id))

    def test_thumbnail_uses_oldest_photo_after_resolution(self):
        """Regression: after a post-repair photo is appended, the dashboard
        thumbnail must keep showing the original obstacle photo."""
        Photo.objects.create(report=self.awaiting, image_url='https://cdn/original.jpg')
        Photo.objects.create(report=self.awaiting, image_url='https://cdn/post-repair.jpg')

        self.client.force_authenticate(user=self.authority)
        response = self.client.get(
            self.url, {"status": ReportStatus.RESOLVED_AWAITING_VALIDATION}
        )
        items = response.json()["reports"]
        item = next(i for i in items if i["reportId"] == str(self.awaiting.id))
        self.assertEqual(item["thumbnailUrl"], 'https://cdn/original.jpg')
