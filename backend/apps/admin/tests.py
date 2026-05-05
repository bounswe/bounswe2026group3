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
from apps.users.models import AccountStatus, User, UserRole


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


# ---------------------------------------------------------------------------
# View: POST /api/admin/users/<uuid>/suspend/
# ---------------------------------------------------------------------------

class SuspendUserViewTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = make_admin()
        self.target = make_reporter()
        self.url = f"/api/admin/users/{self.target.id}/suspend/"

    def test_admin_suspends_user(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(data['accountStatus'], AccountStatus.SUSPENDED)
        self.assertIn('userId', data)
        self.assertIn('reason', data)
        self.target.refresh_from_db()
        self.assertEqual(self.target.account_status, AccountStatus.SUSPENDED)

    def test_suspend_with_reason(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(self.url, {'reason': 'Abusive behaviour'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()['reason'], 'Abusive behaviour')

    def test_anonymous_returns_401(self):
        response = self.client.post(self.url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_non_admin_returns_403(self):
        self.client.force_authenticate(user=self.target)
        response = self.client.post(self.url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_unknown_user_returns_404(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(f"/api/admin/users/{uuid4()}/suspend/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_suspended_user_gets_403_on_protected_endpoint(self):
        self.client.force_authenticate(user=self.admin)
        self.client.post(self.url)
        # Now try a protected endpoint as the suspended user
        self.client.force_authenticate(user=self.target)
        report = make_report(self.target)
        upvote_url = f"/api/reports/{report.id}/upvote/"
        response = self.client.post(upvote_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


# ---------------------------------------------------------------------------
# View: POST /api/admin/users/<uuid>/ban/
# ---------------------------------------------------------------------------

class BanUserViewTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.admin = make_admin()
        self.target = make_reporter()
        self.url = f"/api/admin/users/{self.target.id}/ban/"

    def test_admin_bans_user(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(data['accountStatus'], AccountStatus.BANNED)
        self.assertIn('userId', data)
        self.target.refresh_from_db()
        self.assertEqual(self.target.account_status, AccountStatus.BANNED)

    def test_ban_with_reason(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(self.url, {'reason': 'Spam'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()['reason'], 'Spam')

    def test_anonymous_returns_401(self):
        response = self.client.post(self.url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_non_admin_returns_403(self):
        self.client.force_authenticate(user=self.target)
        response = self.client.post(self.url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_unknown_user_returns_404(self):
        self.client.force_authenticate(user=self.admin)
        response = self.client.post(f"/api/admin/users/{uuid4()}/ban/")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_banned_user_gets_403_on_protected_endpoint(self):
        self.client.force_authenticate(user=self.admin)
        self.client.post(self.url)
        self.client.force_authenticate(user=self.target)
        report = make_report(self.target)
        upvote_url = f"/api/reports/{report.id}/upvote/"
        response = self.client.post(upvote_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)


# ---------------------------------------------------------------------------
# Service: suspend_user / ban_user
# ---------------------------------------------------------------------------

class SuspendBanServiceTest(TestCase):
    def setUp(self):
        self.user = make_reporter()

    def test_suspend_sets_status(self):
        from apps.admin.services import suspend_user
        result = suspend_user(self.user.id, reason='test')
        self.assertEqual(result['accountStatus'], AccountStatus.SUSPENDED)
        self.user.refresh_from_db()
        self.assertEqual(self.user.account_status, AccountStatus.SUSPENDED)

    def test_ban_sets_status(self):
        from apps.admin.services import ban_user
        result = ban_user(self.user.id, reason='test')
        self.assertEqual(result['accountStatus'], AccountStatus.BANNED)
        self.user.refresh_from_db()
        self.assertEqual(self.user.account_status, AccountStatus.BANNED)

    def test_suspend_unknown_raises(self):
        from apps.admin.services import suspend_user
        with self.assertRaises(User.DoesNotExist):
            suspend_user(uuid4())

    def test_ban_unknown_raises(self):
        from apps.admin.services import ban_user
        with self.assertRaises(User.DoesNotExist):
            ban_user(uuid4())
