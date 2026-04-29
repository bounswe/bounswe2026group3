from django.conf import settings
from django.db.models import F, Value
from django.db.models.functions import Greatest

from apps.reports.models import ReportStatus
from apps.users.models import User, UserRole


def _maybe_promote_to_trusted(reporter):
    # FR 1.2.5.4: grant TRUSTED_CONTRIBUTOR when score *exceeds* threshold (strict >).
    if (
        reporter.role == UserRole.REGISTERED_USER
        and reporter.reputation_points > settings.TRUSTED_REPUTATION_THRESHOLD
    ):
        User.objects.filter(pk=reporter.pk, role=UserRole.REGISTERED_USER).update(
            role=UserRole.TRUSTED_CONTRIBUTOR,
        )
        reporter.refresh_from_db(fields=['role'])


def apply_status_change_delta(reporter, *, old_status, new_status):
    """Award the reporter when their report transitions UNVERIFIED -> VERIFIED.

    No-op for any other transition. Returns the reporter's updated trust score.
    """
    if old_status == ReportStatus.UNVERIFIED and new_status == ReportStatus.VERIFIED:
        delta = settings.TRUST_SCORE_VERIFIED_DELTA
        User.objects.filter(pk=reporter.pk).update(
            reputation_points=F('reputation_points') + delta,
        )
        reporter.refresh_from_db(fields=['reputation_points'])
        _maybe_promote_to_trusted(reporter)
    else:
        reporter.refresh_from_db(fields=['reputation_points'])
    return reporter.reputation_points


def apply_malicious_deletion_delta(reporter):
    """Penalize the reporter when a report of theirs is deleted as malicious.

    Floors the trust score at 0. Returns the reporter's updated trust score.
    """
    delta = settings.TRUST_SCORE_MALICIOUS_DELTA
    User.objects.filter(pk=reporter.pk).update(
        reputation_points=Greatest(F('reputation_points') - delta, Value(0)),
    )
    reporter.refresh_from_db(fields=['reputation_points'])
    return reporter.reputation_points
