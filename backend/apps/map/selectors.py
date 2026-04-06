from apps.reports.models import Report, ReportStatus, ReportContext


def get_obstacles_in_bbox(sw_lat, sw_lng, ne_lat, ne_lng, include_passive=False, status=None):
    allowed_statuses = [ReportStatus.VERIFIED]
    if include_passive:
        allowed_statuses.append(ReportStatus.PASSIVE)

    qs = Report.objects.filter(
        status__in=allowed_statuses,
        context=ReportContext.OUTDOOR,
        latitude__gte=sw_lat,
        latitude__lte=ne_lat,
        longitude__gte=sw_lng,
        longitude__lte=ne_lng,
    ).prefetch_related("photos", "interactions").order_by("-created_at")

    if status:
        qs = qs.filter(status=status)

    return qs


def get_obstacle_detail(report_id):
    try:
        return (
            Report.objects.prefetch_related(
                "photos",
                "interactions",
                "status_changes",
                "status_changes__changed_by",
            ).get(
                pk=report_id,
                status__in=[ReportStatus.VERIFIED, ReportStatus.PASSIVE],
            )
        )
    except Report.DoesNotExist:
        return None
