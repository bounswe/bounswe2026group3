import base64
import math
import uuid

from django.conf import settings
from django.db import transaction
from supabase import create_client

from .models import Report, Photo, ReportStatus, ObstacleCategory

EARTH_RADIUS_M = 6_371_000
DUPLICATE_RADIUS_M = 20.0
VERIFICATION_THRESHOLD = 100


def _get_supabase_client():
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)


def _upload_photo_to_supabase(client, base64_string: str) -> tuple[str, str]:
    """Upload a base64-encoded image to Supabase Storage.
    Returns (public_url, file_name) so the caller can delete on failure."""
    if "," in base64_string:
        header, base64_string = base64_string.split(",", 1)
        mime_type = header.split(":")[1].split(";")[0] if ":" in header else "image/jpeg"
    else:
        mime_type = "image/jpeg"

    ext = mime_type.split("/")[-1]
    file_name = f"{uuid.uuid4()}.{ext}"
    image_bytes = base64.b64decode(base64_string)

    client.storage.from_(settings.SUPABASE_PHOTOS_BUCKET).upload(
        path=file_name,
        file=image_bytes,
        file_options={"content-type": mime_type},
    )

    url = client.storage.from_(settings.SUPABASE_PHOTOS_BUCKET).get_public_url(file_name)
    return url, file_name


def create_report(reporter, validated_data) -> Report:
    location = validated_data["location"]
    category = validated_data.get("category", ObstacleCategory.OTHER)
    title = dict(ObstacleCategory.choices).get(category, "Obstacle Report")

    supabase = _get_supabase_client()
    uploaded_files = []

    try:
        with transaction.atomic():
            report = Report.objects.create(
                reporter=reporter,
                title=title,
                description=validated_data.get("description", ""),
                category=category,
                context=validated_data["context"],
                latitude=location["lat"],
                longitude=location["lng"],
                status=ReportStatus.UNVERIFIED,
            )

            photo_objects = []
            for base64_string in validated_data.get("photos", []):
                url, file_name = _upload_photo_to_supabase(supabase, base64_string)
                uploaded_files.append(file_name)
                photo_objects.append(Photo(report=report, image_url=url))

            Photo.objects.bulk_create(photo_objects)

    except Exception:
        if uploaded_files:
            supabase.storage.from_(settings.SUPABASE_PHOTOS_BUCKET).remove(uploaded_files)
        raise

    return report


def save_photos(report: Report, photos: list[str]) -> list[Photo]:
    supabase = _get_supabase_client()
    uploaded_files = []
    try:
        photo_objects = []
        for base64_string in photos:
            url, file_name = _upload_photo_to_supabase(supabase, base64_string)
            uploaded_files.append(file_name)
            photo_objects.append(Photo(report=report, image_url=url))
        return Photo.objects.bulk_create(photo_objects)
    except Exception:
        if uploaded_files:
            supabase.storage.from_(settings.SUPABASE_PHOTOS_BUCKET).remove(uploaded_files)
        raise


def _haversine(lat1, lng1, lat2, lng2):
    """Return distance in meters between two lat/lng points."""
    lat1, lng1, lat2, lng2 = map(math.radians, map(float, [lat1, lng1, lat2, lng2]))
    dlat = lat2 - lat1
    dlng = lng2 - lng1
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    )
    return EARTH_RADIUS_M * 2 * math.asin(math.sqrt(a))


def detect_duplicate(report: Report) -> dict | None:
    """Return {reportId, distance} for the nearest open report within 20m, else None."""
    open_statuses = [ReportStatus.UNVERIFIED, ReportStatus.VERIFIED]
    nearby_reports = Report.objects.filter(
        status__in=open_statuses,
    ).exclude(id=report.id)

    closest = None
    closest_distance = None

    for candidate in nearby_reports:
        distance = _haversine(
            report.latitude,
            report.longitude,
            candidate.latitude,
            candidate.longitude,
        )
        if distance <= DUPLICATE_RADIUS_M:
            if closest_distance is None or distance < closest_distance:
                closest = candidate
                closest_distance = distance

    if closest is not None:
        return {
            "reportId": str(closest.id),
            "distance": round(closest_distance, 2),
        }
    return None


def auto_verify(report: Report) -> bool:
    """Auto-verify if reporter's reputation_points >= VERIFICATION_THRESHOLD."""
    if report.reporter.reputation_points >= VERIFICATION_THRESHOLD:
        report.status = ReportStatus.VERIFIED
        report.save(update_fields=["status"])
        return True
    return False
