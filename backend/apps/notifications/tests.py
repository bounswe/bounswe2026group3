from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.notifications.models import Notification, NotificationType
from apps.notifications.services import create_status_change_notifications
from apps.reports.models import (
    Interaction,
    InteractionType,
    ObstacleCategory,
    Report,
    ReportContext,
    ReportStatus,
)
from apps.reports.signals import report_status_changed
from apps.users.models import User


def make_user(email="user@test.com", **kwargs):
    return User.objects.create_user(
        email=email,
        full_name=kwargs.pop('full_name', 'Test User'),
        password='pass',
        **kwargs,
    )


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
# Service: create_status_change_notifications
# ---------------------------------------------------------------------------

class CreateStatusChangeNotificationsTest(TestCase):
    def test_verified_notifies_only_reporter(self):
        reporter = make_user(email="reporter@test.com")
        upvoter = make_user(email="up@test.com")
        report = make_report(reporter)
        Interaction.objects.create(
            report=report, user=upvoter, interaction_type=InteractionType.UPVOTE
        )

        notifs = create_status_change_notifications(report, ReportStatus.VERIFIED)

        self.assertEqual(len(notifs), 1)
        self.assertEqual(notifs[0].user_id, reporter.id)
        self.assertEqual(notifs[0].notification_type, NotificationType.REPORT_VERIFIED)
        self.assertEqual(notifs[0].related_report_id, report.id)
        self.assertFalse(notifs[0].is_read)

    def test_resolved_notifies_reporter_and_all_upvoters(self):
        reporter = make_user(email="reporter@test.com")
        u1 = make_user(email="u1@test.com")
        u2 = make_user(email="u2@test.com")
        report = make_report(reporter)
        Interaction.objects.create(report=report, user=u1, interaction_type=InteractionType.UPVOTE)
        Interaction.objects.create(report=report, user=u2, interaction_type=InteractionType.UPVOTE)
        # Flag is not an upvote — should not get notified.
        flagger = make_user(email="flagger@test.com")
        Interaction.objects.create(report=report, user=flagger, interaction_type=InteractionType.FLAG)

        notifs = create_status_change_notifications(
            report, ReportStatus.RESOLVED_AWAITING_VALIDATION,
        )

        recipient_ids = {n.user_id for n in notifs}
        self.assertEqual(recipient_ids, {reporter.id, u1.id, u2.id})
        for n in notifs:
            self.assertEqual(n.notification_type, NotificationType.REPORT_RESOLVED)

    def test_users_with_notifications_disabled_are_skipped(self):
        reporter = make_user(email="reporter@test.com", notifications_enabled=False)
        u1 = make_user(email="u1@test.com", notifications_enabled=False)
        u2 = make_user(email="u2@test.com", notifications_enabled=True)
        report = make_report(reporter)
        Interaction.objects.create(report=report, user=u1, interaction_type=InteractionType.UPVOTE)
        Interaction.objects.create(report=report, user=u2, interaction_type=InteractionType.UPVOTE)

        notifs = create_status_change_notifications(
            report, ReportStatus.RESOLVED_AWAITING_VALIDATION,
        )

        self.assertEqual({n.user_id for n in notifs}, {u2.id})

    def test_non_relevant_status_creates_nothing(self):
        reporter = make_user(email="reporter@test.com")
        report = make_report(reporter)
        notifs = create_status_change_notifications(report, ReportStatus.UNVERIFIED)
        self.assertEqual(notifs, [])

    def test_closed_notifies_only_reporter(self):
        reporter = make_user(email="reporter@test.com")
        # Upvoters are NOT notified on CLOSED — only the reporter.
        upvoter = make_user(email="up@test.com")
        report = make_report(reporter, status=ReportStatus.RESOLVED_AWAITING_VALIDATION)
        Interaction.objects.create(
            report=report, user=upvoter, interaction_type=InteractionType.UPVOTE,
        )

        notifs = create_status_change_notifications(report, ReportStatus.CLOSED)

        self.assertEqual(len(notifs), 1)
        self.assertEqual(notifs[0].user_id, reporter.id)
        self.assertEqual(notifs[0].notification_type, NotificationType.REPORT_CLOSED)
        self.assertEqual(notifs[0].related_report_id, report.id)
        self.assertIn(report.title, notifs[0].message)

    def test_closed_skips_when_reporter_is_the_actor(self):
        reporter = make_user(email="reporter@test.com")
        report = make_report(reporter, status=ReportStatus.RESOLVED_AWAITING_VALIDATION)

        notifs = create_status_change_notifications(
            report, ReportStatus.CLOSED, actor_id=reporter.id,
        )
        self.assertEqual(notifs, [])

    def test_closed_includes_reason_when_provided(self):
        reporter = make_user(email="reporter@test.com")
        report = make_report(reporter, status=ReportStatus.RESOLVED_AWAITING_VALIDATION)
        other = make_user(email="other@test.com")

        notifs = create_status_change_notifications(
            report, ReportStatus.CLOSED,
            actor_id=other.id,
            reason='Community resolution confirmed.',
        )
        self.assertEqual(len(notifs), 1)
        self.assertIn('Community resolution confirmed.', notifs[0].message)

    def test_closed_respects_notifications_enabled_flag(self):
        reporter = make_user(email="reporter@test.com", notifications_enabled=False)
        report = make_report(reporter, status=ReportStatus.RESOLVED_AWAITING_VALIDATION)

        notifs = create_status_change_notifications(report, ReportStatus.CLOSED)
        self.assertEqual(notifs, [])


# ---------------------------------------------------------------------------
# Async firing: signal + transaction.on_commit
# ---------------------------------------------------------------------------

class StatusChangeSignalAsyncTest(TestCase):
    def test_handler_defers_via_on_commit(self):
        """Receiver schedules work on commit; nothing is created until callbacks run."""
        reporter = make_user(email="reporter@test.com")
        report = make_report(reporter)

        with self.captureOnCommitCallbacks(execute=False) as callbacks:
            report_status_changed.send(
                sender=Report,
                report=report,
                old_status=ReportStatus.UNVERIFIED,
                new_status=ReportStatus.VERIFIED,
                actor=None,
            )
            self.assertEqual(Notification.objects.count(), 0)

        self.assertEqual(len(callbacks), 1)
        # Now run the deferred work.
        for cb in callbacks:
            cb()
        self.assertEqual(Notification.objects.count(), 1)

    def test_rolled_back_transaction_creates_no_notification(self):
        """If the surrounding transaction is rolled back, on_commit never runs."""
        from django.db import transaction

        reporter = make_user(email="reporter@test.com")
        report = make_report(reporter)

        try:
            with transaction.atomic():
                report_status_changed.send(
                    sender=Report,
                    report=report,
                    old_status=ReportStatus.UNVERIFIED,
                    new_status=ReportStatus.VERIFIED,
                    actor=None,
                )
                raise RuntimeError("simulated failure")
        except RuntimeError:
            pass

        self.assertEqual(Notification.objects.count(), 0)


# ---------------------------------------------------------------------------
# Integration: register_upvote triggers notification on VERIFIED
# ---------------------------------------------------------------------------

class UpvoteVerifiesAndNotifiesTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.reporter = make_user(email="reporter@test.com")
        self.report = make_report(self.reporter, status=ReportStatus.UNVERIFIED)
        self.url = f"/api/reports/{self.report.id}/upvote/"

    def _vote_until_verified(self):
        # Threshold for REGISTERED_USER reporter is strict > 5 → 6th upvote verifies.
        for i in range(5):
            self.client.force_authenticate(user=make_user(email=f"v{i}@test.com"))
            self.client.post(self.url)
        self.client.force_authenticate(user=make_user(email="v5@test.com"))
        return self.client.post(self.url)

    def test_verified_transition_creates_notification_for_reporter(self):
        with self.captureOnCommitCallbacks(execute=True):
            response = self._vote_until_verified()

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["status"], ReportStatus.VERIFIED)

        notifs = list(Notification.objects.filter(user=self.reporter))
        self.assertEqual(len(notifs), 1)
        self.assertEqual(notifs[0].notification_type, NotificationType.REPORT_VERIFIED)

    def test_verified_transition_respects_reporter_toggle(self):
        self.reporter.notifications_enabled = False
        self.reporter.save(update_fields=['notifications_enabled'])

        with self.captureOnCommitCallbacks(execute=True):
            self._vote_until_verified()

        self.assertEqual(Notification.objects.filter(user=self.reporter).count(), 0)


# ---------------------------------------------------------------------------
# Integration: confirm-resolution threshold triggers REPORT_CLOSED notification
# ---------------------------------------------------------------------------

from django.test import override_settings


@override_settings(RESOLUTION_CONFIRMATION_THRESHOLD=3)
class ConfirmResolutionClosesAndNotifiesTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.reporter = make_user(email="reporter@test.com")
        self.report = make_report(
            self.reporter, status=ReportStatus.RESOLVED_AWAITING_VALIDATION,
        )
        self.url = f"/api/reports/{self.report.id}/confirm-resolution/"

    def _confirm_to_threshold(self, last_actor):
        """Two other users confirm, then `last_actor` confirms — closing the report."""
        u1 = make_user(email="u1@test.com")
        u2 = make_user(email="u2@test.com")
        for u in (u1, u2):
            self.client.force_authenticate(user=u)
            self.client.post(self.url)
        self.client.force_authenticate(user=last_actor)
        return self.client.post(self.url)

    def test_closed_transition_creates_notification_for_reporter(self):
        outsider = make_user(email="closer@test.com")
        with self.captureOnCommitCallbacks(execute=True):
            response = self._confirm_to_threshold(outsider)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()["status"], ReportStatus.CLOSED)

        notifs = list(Notification.objects.filter(user=self.reporter))
        self.assertEqual(len(notifs), 1)
        self.assertEqual(notifs[0].notification_type, NotificationType.REPORT_CLOSED)
        self.assertEqual(notifs[0].related_report_id, self.report.id)
        self.assertIn(self.report.title, notifs[0].message)
        self.assertIn('Community resolution confirmed.', notifs[0].message)

    def test_no_notification_when_reporter_closes_their_own_report(self):
        with self.captureOnCommitCallbacks(execute=True):
            self._confirm_to_threshold(self.reporter)

        self.assertEqual(Notification.objects.filter(user=self.reporter).count(), 0)


# ---------------------------------------------------------------------------
# API: GET /api/notifications/  and  PATCH /api/notifications/{id}/read/
# ---------------------------------------------------------------------------

class NotificationListViewTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = make_user(email="me@test.com")
        self.other = make_user(email="other@test.com")
        self.report = make_report(self.user)

    def _create(self, user, **overrides):
        defaults = dict(
            user=user,
            notification_type=NotificationType.REPORT_VERIFIED,
            message="hi",
            related_report=self.report,
        )
        defaults.update(overrides)
        return Notification.objects.create(**defaults)

    def test_anonymous_returns_401(self):
        response = self.client.get("/api/notifications/")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_returns_only_callers_notifications_ordered_by_recent_first(self):
        n_old = self._create(self.user, message="old")
        n_new = self._create(self.user, message="new")
        self._create(self.other, message="someone else")

        self.client.force_authenticate(user=self.user)
        response = self.client.get("/api/notifications/")

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(len(data), 2)
        self.assertEqual(data[0]["id"], n_new.id)
        self.assertEqual(data[1]["id"], n_old.id)

    def test_payload_shape(self):
        n = self._create(self.user, message="hello")
        self.client.force_authenticate(user=self.user)

        response = self.client.get("/api/notifications/")
        item = response.json()[0]

        self.assertEqual(set(item.keys()), {
            "id", "type", "reportId", "message", "isRead", "createdAt",
        })
        self.assertEqual(item["type"], NotificationType.REPORT_VERIFIED)
        self.assertEqual(item["reportId"], str(self.report.id))
        self.assertFalse(item["isRead"])


class NotificationMarkReadViewTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = make_user(email="me@test.com")
        self.other = make_user(email="other@test.com")
        self.report = make_report(self.user)
        self.notification = Notification.objects.create(
            user=self.user,
            notification_type=NotificationType.REPORT_VERIFIED,
            message="hello",
            related_report=self.report,
        )
        self.url = f"/api/notifications/{self.notification.id}/read/"

    def test_anonymous_returns_401(self):
        response = self.client.patch(self.url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_marks_notification_as_read(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.patch(self.url)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.json()["isRead"])
        self.notification.refresh_from_db()
        self.assertTrue(self.notification.is_read)

    def test_other_users_notification_returns_404(self):
        self.client.force_authenticate(user=self.other)
        response = self.client.patch(self.url)

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.notification.refresh_from_db()
        self.assertFalse(self.notification.is_read)

    def test_unknown_id_returns_404(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.patch("/api/notifications/999999/read/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


# ---------------------------------------------------------------------------
# /me exposes and updates notificationsEnabled
# ---------------------------------------------------------------------------

class MeNotificationsToggleTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = make_user(email="me@test.com")
        self.client.force_authenticate(user=self.user)
        self.url = "/api/auth/users/me"

    def test_get_includes_notifications_enabled_default_true(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.json()["notificationsEnabled"])

    def test_patch_disables_notifications(self):
        response = self.client.patch(self.url, {"notificationsEnabled": False}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertFalse(response.json()["notificationsEnabled"])
        self.user.refresh_from_db()
        self.assertFalse(self.user.notifications_enabled)
