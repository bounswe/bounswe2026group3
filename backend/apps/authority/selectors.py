from django.db.models import Count, Q

from apps.reports.models import InteractionType, Report, ReportStatus


DASHBOARD_STATUSES = (
    ReportStatus.VERIFIED,
    ReportStatus.RESOLVED_AWAITING_VALIDATION,
    ReportStatus.CLOSED,
)


def get_dashboard_reports(status_filter: str | None = None):
    qs = (
        Report.objects.filter(status__in=DASHBOARD_STATUSES)
        .select_related('reporter')
        .prefetch_related('photos', 'interactions')
        .annotate(
            upvote_count=Count(
                'interactions',
                filter=Q(interactions__interaction_type=InteractionType.UPVOTE),
            ),
        )
        .order_by('-created_at')
    )
    if status_filter:
        qs = qs.filter(status=status_filter)
    return qs


def get_dashboard_status_counts() -> dict:
    counts = {row['status']: row['n'] for row in (
        Report.objects.filter(status__in=DASHBOARD_STATUSES)
        .values('status')
        .annotate(n=Count('id'))
    )}
    verified = counts.get(ReportStatus.VERIFIED, 0)
    awaiting = counts.get(ReportStatus.RESOLVED_AWAITING_VALIDATION, 0)
    closed = counts.get(ReportStatus.CLOSED, 0)
    return {
        'verified': verified,
        'awaitingValidation': awaiting,
        'closed': closed,
        'total': verified + awaiting + closed,
    }
