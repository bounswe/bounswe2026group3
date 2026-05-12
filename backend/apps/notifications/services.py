from apps.reports.models import InteractionType, Report, ReportStatus
from apps.users.models import User

from .models import Notification, NotificationType


def _verified_message(report: Report) -> str:
    return f'Your report "{report.title}" has been verified.'


def _resolved_message(report: Report) -> str:
    return (
        f'The obstacle reported as "{report.title}" has been marked resolved '
        f'and is awaiting validation.'
    )


def _closed_message(report: Report, reason: str | None = None) -> str:
    base = f'Your report "{report.title}" has been closed.'
    if reason:
        return f'{base} {reason}'
    return base


def create_status_change_notifications(
    report: Report,
    new_status: str,
    *,
    actor_id: int | None = None,
    reason: str | None = None,
) -> list[Notification]:
    """Create in-app notifications for a report status transition.

    - VERIFIED: notify the reporter only.
    - RESOLVED_AWAITING_VALIDATION: notify reporter + all distinct upvoters.
    - CLOSED: notify the reporter only (unless they performed the close action).
    Recipients with notifications_enabled=False are skipped silently.
    """
    if new_status == ReportStatus.VERIFIED:
        recipient_ids = {report.reporter_id}
        message = _verified_message(report)
        notif_type = NotificationType.REPORT_VERIFIED
    elif new_status == ReportStatus.RESOLVED_AWAITING_VALIDATION:
        upvoter_ids = set(
            report.interactions.filter(
                interaction_type=InteractionType.UPVOTE,
            ).values_list('user_id', flat=True)
        )
        recipient_ids = {report.reporter_id} | upvoter_ids
        message = _resolved_message(report)
        notif_type = NotificationType.REPORT_RESOLVED
    elif new_status == ReportStatus.CLOSED:
        # Don't self-notify when the reporter closed their own report.
        if actor_id is not None and actor_id == report.reporter_id:
            return []
        recipient_ids = {report.reporter_id}
        message = _closed_message(report, reason)
        notif_type = NotificationType.REPORT_CLOSED
    else:
        return []

    enabled_ids = User.objects.filter(
        id__in=recipient_ids,
        notifications_enabled=True,
    ).values_list('id', flat=True)

    notifications = [
        Notification(
            user_id=user_id,
            notification_type=notif_type,
            message=message,
            related_report=report,
        )
        for user_id in enabled_ids
    ]
    return Notification.objects.bulk_create(notifications)
