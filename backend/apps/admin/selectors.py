from django.conf import settings
from django.db.models import Count, Q

from apps.reports.models import Interaction, InteractionType, Report


def get_moderation_queue():
    """Return reports whose flag count has reached SPAM_FLAG_THRESHOLD."""
    return (
        Report.objects.annotate(
            flag_count=Count(
                'interactions',
                filter=Q(interactions__interaction_type=InteractionType.FLAG),
            )
        )
        .filter(flag_count__gte=settings.SPAM_FLAG_THRESHOLD)
        .select_related('reporter')
        .order_by('-flag_count', '-created_at')
    )
