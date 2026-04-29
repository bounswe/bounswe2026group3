from django.test import TestCase, override_settings

from apps.reports.models import ReportStatus
from apps.trust_scores.services import (
    apply_malicious_deletion_delta,
    apply_status_change_delta,
)
from apps.users.models import User


def make_user(points=0, email="trust@test.com"):
    user = User.objects.create_user(email=email, full_name="Trust User", password="pass")
    if points:
        user.reputation_points = points
        user.save(update_fields=['reputation_points'])
    return user


@override_settings(TRUST_SCORE_VERIFIED_DELTA=7, TRUST_SCORE_MALICIOUS_DELTA=4)
class ApplyStatusChangeDeltaTest(TestCase):
    def test_increments_on_unverified_to_verified(self):
        user = make_user(points=10)

        new_score = apply_status_change_delta(
            user,
            old_status=ReportStatus.UNVERIFIED,
            new_status=ReportStatus.VERIFIED,
        )

        self.assertEqual(new_score, 17)
        user.refresh_from_db()
        self.assertEqual(user.reputation_points, 17)

    def test_increments_from_zero(self):
        user = make_user(points=0)

        new_score = apply_status_change_delta(
            user,
            old_status=ReportStatus.UNVERIFIED,
            new_status=ReportStatus.VERIFIED,
        )

        self.assertEqual(new_score, 7)

    def test_reads_delta_from_settings(self):
        user = make_user(points=0)

        with override_settings(TRUST_SCORE_VERIFIED_DELTA=42):
            new_score = apply_status_change_delta(
                user,
                old_status=ReportStatus.UNVERIFIED,
                new_status=ReportStatus.VERIFIED,
            )

        self.assertEqual(new_score, 42)

    def test_noop_on_unrelated_transition(self):
        user = make_user(points=10)

        new_score = apply_status_change_delta(
            user,
            old_status=ReportStatus.VERIFIED,
            new_status=ReportStatus.CLOSED,
        )

        self.assertEqual(new_score, 10)

    def test_noop_when_new_status_is_not_verified(self):
        user = make_user(points=10)

        new_score = apply_status_change_delta(
            user,
            old_status=ReportStatus.UNVERIFIED,
            new_status=ReportStatus.PASSIVE,
        )

        self.assertEqual(new_score, 10)


@override_settings(TRUST_SCORE_VERIFIED_DELTA=7, TRUST_SCORE_MALICIOUS_DELTA=4)
class ApplyMaliciousDeletionDeltaTest(TestCase):
    def test_decrements_by_configured_delta(self):
        user = make_user(points=10)

        new_score = apply_malicious_deletion_delta(user)

        self.assertEqual(new_score, 6)
        user.refresh_from_db()
        self.assertEqual(user.reputation_points, 6)

    def test_floors_at_zero_when_delta_exceeds_score(self):
        user = make_user(points=2)

        new_score = apply_malicious_deletion_delta(user)

        self.assertEqual(new_score, 0)
        user.refresh_from_db()
        self.assertEqual(user.reputation_points, 0)

    def test_stays_at_zero_when_already_zero(self):
        user = make_user(points=0)

        new_score = apply_malicious_deletion_delta(user)

        self.assertEqual(new_score, 0)

    def test_exact_match_reaches_zero(self):
        user = make_user(points=4)

        new_score = apply_malicious_deletion_delta(user)

        self.assertEqual(new_score, 0)

    def test_reads_delta_from_settings(self):
        user = make_user(points=100)

        with override_settings(TRUST_SCORE_MALICIOUS_DELTA=25):
            new_score = apply_malicious_deletion_delta(user)

        self.assertEqual(new_score, 75)
