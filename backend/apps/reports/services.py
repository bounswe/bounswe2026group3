import base64
import uuid

from django.conf import settings
from django.db import transaction
from supabase import create_client

from apps.users.models import UserRole

from .models import Interaction, InteractionType, Report, Photo, ReportStatus, ObstacleCategory, StatusChange


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


class SelfInteractionError(Exception):
    """Raised when a user attempts to interact with their own report."""

SelfUpvoteError = SelfInteractionError


class ConflictingInteractionError(Exception):
    """Raised when a user tries to upvote a report they flagged, or vice versa."""


class AlreadyUpvotedError(Exception):
    """Raised when a user tries to flag a report they have already upvoted."""


class NotEligibleToConfirmError(Exception):
    """Raised when a user is neither the reporter nor an upvoter."""


class ReportNotAwaitingValidationError(Exception):
    """Raised when confirm-resolution is called on a report not in RESOLVED_AWAITING_VALIDATION."""


def _upvote_threshold_for(reporter) -> int:
    if reporter.role == UserRole.TRUSTED_CONTRIBUTOR:
        return settings.AUTO_VERIFY_TRUSTED_UPVOTE_THRESHOLD
    return settings.AUTO_VERIFY_UPVOTE_THRESHOLD


@transaction.atomic
def toggle_upvote(user, report_id) -> dict:
    """Toggle an upvote on a report (add if absent, remove if present).

    - Raises Report.DoesNotExist for an unknown id.
    - Raises SelfInteractionError if the caller is the report's reporter.
    - Raises ConflictingInteractionError if the user has flagged the report.
    - When adding an upvote and the count exceeds the threshold while the report
      is still UNVERIFIED, transitions to VERIFIED and awards trust score.
    """
    from apps.trust_scores.services import apply_status_change_delta
    from apps.reports.signals import report_status_changed

    report = Report.objects.select_for_update().select_related('reporter').get(pk=report_id)

    if report.reporter_id == user.id:
        raise SelfInteractionError()

    if Interaction.objects.filter(report=report, user=user, interaction_type=InteractionType.FLAG).exists():
        raise ConflictingInteractionError()

    try:
        existing = Interaction.objects.get(
            report=report, user=user, interaction_type=InteractionType.UPVOTE,
        )
        existing.delete()
        user_upvoted = False
        auto_verified = False
    except Interaction.DoesNotExist:
        Interaction.objects.create(
            report=report, user=user, interaction_type=InteractionType.UPVOTE,
        )
        user_upvoted = True
        upvote_count_check = Interaction.objects.filter(
            report=report, interaction_type=InteractionType.UPVOTE,
        ).count()
        auto_verified = False
        if (
            report.status == ReportStatus.UNVERIFIED
            and upvote_count_check > _upvote_threshold_for(report.reporter)
        ):
            old_status = report.status
            report.status = ReportStatus.VERIFIED
            report.save(update_fields=['status', 'updated_at'])
            apply_status_change_delta(
                report.reporter,
                old_status=old_status,
                new_status=ReportStatus.VERIFIED,
            )
            report_status_changed.send(
                sender=Report,
                report=report,
                old_status=old_status,
                new_status=ReportStatus.VERIFIED,
                actor=user,
            )
            auto_verified = True

    upvote_count = Interaction.objects.filter(
        report=report, interaction_type=InteractionType.UPVOTE,
    ).count()

    return {
        'reportId': report.id,
        'upvoteCount': upvote_count,
        'userUpvoted': user_upvoted,
        'status': report.status,
        'autoVerified': auto_verified,
    }


# Keep old name as alias so existing imports don't break
register_upvote = toggle_upvote


@transaction.atomic
def toggle_flag(user, report_id) -> dict:
    """Toggle a flag on a report (add if absent, remove if present).

    - Raises Report.DoesNotExist for an unknown id.
    - Raises SelfInteractionError if the caller is the report's reporter.
    - Raises ConflictingInteractionError if the user has upvoted the report.
    """
    report = Report.objects.select_for_update().get(pk=report_id)

    if report.reporter_id == user.id:
        raise SelfInteractionError()

    if Interaction.objects.filter(report=report, user=user, interaction_type=InteractionType.UPVOTE).exists():
        raise ConflictingInteractionError()

    try:
        existing = Interaction.objects.get(
            report=report, user=user, interaction_type=InteractionType.FLAG,
        )
        existing.delete()
        user_flagged = False
    except Interaction.DoesNotExist:
        Interaction.objects.create(
            report=report, user=user, interaction_type=InteractionType.FLAG,
        )
        user_flagged = True

    flag_count = Interaction.objects.filter(
        report=report, interaction_type=InteractionType.FLAG,
    ).count()

    return {
        'reportId': report.id,
        'flagCount': flag_count,
        'userFlagged': user_flagged,
    }


@transaction.atomic
def register_flag(user, report_id) -> dict:
    """Record a spam flag on a report. Idempotent: re-calling does not double-count.

    - Raises Report.DoesNotExist for an unknown id.
    - Raises AlreadyUpvotedError if the caller has previously upvoted this report.
    - Returns queuedForModeration=True when flagCount reaches SPAM_FLAG_THRESHOLD.
    """
    report = Report.objects.select_for_update().get(pk=report_id)

    has_upvoted = Interaction.objects.filter(
        report=report,
        user=user,
        interaction_type=InteractionType.UPVOTE,
    ).exists()
    if has_upvoted:
        raise AlreadyUpvotedError()

    Interaction.objects.get_or_create(
        report=report,
        user=user,
        interaction_type=InteractionType.FLAG,
    )

    flag_count = Interaction.objects.filter(
        report=report,
        interaction_type=InteractionType.FLAG,
    ).count()

    return {
        'reportId': report.id,
        'flagCount': flag_count,
        'queuedForModeration': flag_count >= settings.SPAM_FLAG_THRESHOLD,
    }


@transaction.atomic
def register_resolution_confirmation(user, report_id) -> dict:
    """Record a resolution confirmation from an eligible user.

    Eligible users are the original reporter or anyone who previously upvoted.
    Idempotent: re-calling by the same user does not double-count.
    When the confirmation count reaches RESOLUTION_CONFIRMATION_THRESHOLD,
    the report transitions to CLOSED and the transition is recorded in StatusChange.

    Raises:
        Report.DoesNotExist                  — unknown report id
        ReportNotAwaitingValidationError     — report is not RESOLVED_AWAITING_VALIDATION
        NotEligibleToConfirmError            — user is neither reporter nor upvoter
    """
    report = Report.objects.select_for_update().get(pk=report_id)

    if report.status != ReportStatus.RESOLVED_AWAITING_VALIDATION:
        raise ReportNotAwaitingValidationError()

    is_reporter = report.reporter_id == user.id
    is_upvoter = Interaction.objects.filter(
        report=report,
        user=user,
        interaction_type=InteractionType.UPVOTE,
    ).exists()

    if not (is_reporter or is_upvoter):
        raise NotEligibleToConfirmError()

    _, created = Interaction.objects.get_or_create(
        report=report,
        user=user,
        interaction_type=InteractionType.CONFIRM_RESOLUTION,
    )

    confirmation_count = Interaction.objects.filter(
        report=report,
        interaction_type=InteractionType.CONFIRM_RESOLUTION,
    ).count()

    if created and confirmation_count >= settings.RESOLUTION_CONFIRMATION_THRESHOLD:
        old_status = report.status
        report.status = ReportStatus.CLOSED
        report.save(update_fields=['status', 'updated_at'])
        StatusChange.objects.create(
            report=report,
            changed_by=user,
            old_status=old_status,
            new_status=ReportStatus.CLOSED,
            reason='Community resolution confirmed.',
        )

    return {
        'reportId': report.id,
        'confirmationCount': confirmation_count,
        'status': report.status,
    }
