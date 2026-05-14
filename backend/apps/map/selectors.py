from django.db.models import Count, Q

from apps.map.models import CampusLocation
from apps.reports.models import InteractionType, Report, ReportStatus


def get_obstacles_in_bbox(sw_lat, sw_lng, ne_lat, ne_lng, include_passive=False, status=None):
    allowed_statuses = [ReportStatus.VERIFIED, ReportStatus.UNVERIFIED, ReportStatus.RESOLVED_AWAITING_VALIDATION]
    if include_passive:
        allowed_statuses.append(ReportStatus.PASSIVE)

    qs = Report.objects.filter(
        status__in=allowed_statuses,
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
            Report.objects.select_related("reporter").prefetch_related(
                "photos",
                "interactions",
                "status_changes",
                "status_changes__changed_by",
            ).get(
                pk=report_id,
                status__in=[
                    ReportStatus.VERIFIED,
                    ReportStatus.UNVERIFIED,
                    ReportStatus.PASSIVE,
                    ReportStatus.RESOLVED_AWAITING_VALIDATION,
                    ReportStatus.CLOSED,
                ],
            )
        )
    except Report.DoesNotExist:
        return None


def search_campus_locations(query):
    return list(
        CampusLocation.objects.filter(
            Q(name__icontains=query) | Q(aliases__icontains=query)
        ).order_by("name").values("name", "aliases", "latitude", "longitude", "category")
    )


def search_nominatim(query):
    import requests
    try:
        resp = requests.get(
            "https://nominatim.openstreetmap.org/search",
            params={
                "q": query,
                "format": "json",
                "limit": 5,
                "addressdetails": 0,
                "countrycodes": "tr",
            },
            headers={"User-Agent": "AccessMap/1.0"},
            timeout=5,
        )
        if resp.status_code != 200:
            return []
        results = []
        for item in resp.json():
            results.append({
                "name": item.get("display_name", ""),
                "latitude": float(item["lat"]),
                "longitude": float(item["lon"]),
                "category": item.get("type", "place"),
                "source": "osm",
            })
        return results
    except Exception:
        return []
