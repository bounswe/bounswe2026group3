from django.db import transaction

from apps.reports.models import Report, ReportStatus, StatusChange
from apps.reports.services import save_photos
from apps.reports.signals import report_status_changed


class ReportAlreadyResolvedError(Exception):
    """Raised when an authority tries to resolve a report that is already resolved or closed."""


def resolve_report(*, actor, report_id, repair_photo: str, repair_notes: str = '') -> Report:
    """Mark a report as RESOLVED_AWAITING_VALIDATION.

    Uploads the post-repair photo to storage, attaches it to the Report, records a
    StatusChange entry and emits report_status_changed so notifications fire after
    commit. Raises Report.DoesNotExist or ReportAlreadyResolvedError.

    The post-repair photo upload happens *before* the DB transaction so we don't
    hold a row lock during a slow network call. If status changed concurrently the
    transaction will fail and we'll have left an orphan photo URL — that's a known
    trade-off and consistent with how create_report handles uploads.
    """
    # Pre-flight check (no lock) — fail fast before uploading.
    report = Report.objects.get(pk=report_id)
    if report.status in (ReportStatus.RESOLVED_AWAITING_VALIDATION, ReportStatus.CLOSED):
        raise ReportAlreadyResolvedError()

    photos = save_photos(report, [repair_photo])
    repair_photo_url = photos[0].image_url

    with transaction.atomic():
        report = Report.objects.select_for_update().get(pk=report_id)
        if report.status in (ReportStatus.RESOLVED_AWAITING_VALIDATION, ReportStatus.CLOSED):
            raise ReportAlreadyResolvedError()

        old_status = report.status
        report.status = ReportStatus.RESOLVED_AWAITING_VALIDATION
        report.save(update_fields=['status', 'updated_at'])

        reason = f'repair_photo_url: {repair_photo_url}'
        if repair_notes:
            reason = f'{reason}; notes: {repair_notes}'

        StatusChange.objects.create(
            report=report,
            changed_by=actor,
            old_status=old_status,
            new_status=ReportStatus.RESOLVED_AWAITING_VALIDATION,
            reason=reason,
        )

        report_status_changed.send(
            sender=Report,
            report=report,
            old_status=old_status,
            new_status=ReportStatus.RESOLVED_AWAITING_VALIDATION,
            actor=actor,
        )

    report.repair_photo_url = repair_photo_url
    return report
