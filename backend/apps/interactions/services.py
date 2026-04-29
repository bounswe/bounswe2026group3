from django.conf import settings
from django.db import transaction
from rest_framework.exceptions import NotFound, PermissionDenied

from apps.reports.models import Interaction, InteractionType, Report, ReportStatus


def upvote_report(user, report_id) -> dict:
    try:
        report = Report.objects.get(pk=report_id)
    except Report.DoesNotExist:
        raise NotFound("Report not found.")

    if report.reporter_id == user.pk:
        raise PermissionDenied("Cannot upvote your own report.")

    with transaction.atomic():
        _, created = Interaction.objects.get_or_create(
            report=report,
            user=user,
            interaction_type=InteractionType.UPVOTE,
        )

        upvote_count = report.interactions.filter(
            interaction_type=InteractionType.UPVOTE
        ).count()

        if created and upvote_count >= settings.UPVOTE_THRESHOLD:
            report.status = ReportStatus.CONFIRMED
            report.save(update_fields=["status", "updated_at"])

    return {
        "reportId": report.id,
        "upvoteCount": upvote_count,
        "status": report.status,
    }
