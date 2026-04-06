from apps.reports.models import Report, ReportStatus


def get_obstacles_in_bbox(west, south, east, north, include_passive=False):
    statuses = [ReportStatus.VERIFIED]
    if include_passive:
        statuses.append(ReportStatus.PASSIVE)

    return (
        Report.objects.filter(
            status__in=statuses,
            latitude__gte=south,
            latitude__lte=north,
            longitude__gte=west,
            longitude__lte=east,
        )
        .prefetch_related("interactions")
        .order_by("-created_at")
    )


def get_obstacle_detail(report_id):
    try:
        return (
            Report.objects.prefetch_related("photos", "interactions")
            .get(pk=report_id, status__in=[ReportStatus.VERIFIED, ReportStatus.PASSIVE])
        )
    except Report.DoesNotExist:
        return None
