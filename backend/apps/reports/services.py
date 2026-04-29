import base64
import uuid

from django.conf import settings
from django.db import transaction
from supabase import create_client

from apps.users.models import UserRole

from .models import Interaction, InteractionType, Report, Photo, ReportStatus, ObstacleCategory


def _get_supabase_client():
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)


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
                status=ReportStatus.VERIFIED,
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


def detect_duplicate(report: Report) -> Report | None:
    """Return a similar existing report if found, else None."""
    pass


def auto_verify(report: Report) -> bool:
    """Return True if report meets auto-verification criteria."""
    pass


class SelfUpvoteError(Exception):
    """Raised when a user attempts to upvote their own report."""


def _upvote_threshold_for(reporter) -> int:
    if reporter.role == UserRole.TRUSTED_CONTRIBUTOR:
        return settings.AUTO_VERIFY_TRUSTED_UPVOTE_THRESHOLD
    return settings.AUTO_VERIFY_UPVOTE_THRESHOLD


@transaction.atomic
def register_upvote(user, report_id) -> dict:
    """Record an upvote on a report. Idempotent: re-calling does not double-count.

    - Raises Report.DoesNotExist for an unknown id.
    - Raises SelfUpvoteError if the caller is the report's reporter.
    - When the upvote count *strictly exceeds* the threshold (picked by reporter role)
      and the report is still UNVERIFIED, transitions to VERIFIED and awards trust score.
    """
    from apps.trust_scores.services import apply_status_change_delta

    report = Report.objects.select_for_update().select_related('reporter').get(pk=report_id)

    if report.reporter_id == user.id:
        raise SelfUpvoteError()

    _, created = Interaction.objects.get_or_create(
        report=report,
        user=user,
        interaction_type=InteractionType.UPVOTE,
    )

    upvote_count = Interaction.objects.filter(
        report=report,
        interaction_type=InteractionType.UPVOTE,
    ).count()

    auto_verified = False
    if (
        created
        and report.status == ReportStatus.UNVERIFIED
        and upvote_count > _upvote_threshold_for(report.reporter)
    ):
        old_status = report.status
        report.status = ReportStatus.VERIFIED
        report.save(update_fields=['status', 'updated_at'])
        apply_status_change_delta(
            report.reporter,
            old_status=old_status,
            new_status=ReportStatus.VERIFIED,
        )
        auto_verified = True

    return {
        'reportId': report.id,
        'upvoteCount': upvote_count,
        'status': report.status,
        'autoVerified': auto_verified,
    }
