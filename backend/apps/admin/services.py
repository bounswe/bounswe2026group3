from django.db import transaction

from apps.reports.models import Report
from apps.trust_scores.services import apply_malicious_deletion_delta
from apps.users.models import AccountStatus, User


@transaction.atomic
def delete_report_as_malicious(report_id):
    """Delete a report flagged as malicious and penalize the reporter's trust score.

    Decrement and deletion run in one transaction so they succeed or roll back together.
    Raises Report.DoesNotExist if the id is unknown.
    """
    report = Report.objects.select_related('reporter').get(pk=report_id)
    reporter = report.reporter
    new_score = apply_malicious_deletion_delta(reporter)
    report.delete()
    return {'reporter_id': reporter.pk, 'trust_score': new_score}


def suspend_user(user_id, reason: str = '') -> dict:
    """Set a user's account_status to SUSPENDED.

    Raises User.DoesNotExist if the id is unknown.
    """
    user = User.objects.get(pk=user_id)
    user.account_status = AccountStatus.SUSPENDED
    user.save(update_fields=['account_status', 'updated_at'])
    return {'userId': user.id, 'accountStatus': user.account_status, 'reason': reason}


def ban_user(user_id, reason: str = '') -> dict:
    """Set a user's account_status to BANNED.

    Raises User.DoesNotExist if the id is unknown.
    """
    user = User.objects.get(pk=user_id)
    user.account_status = AccountStatus.BANNED
    user.save(update_fields=['account_status', 'updated_at'])
    return {'userId': user.id, 'accountStatus': user.account_status, 'reason': reason}
