import datetime

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.reports.models import Report, ReportStatus, StatusChange
from apps.reports.signals import report_status_changed


class Command(BaseCommand):
    help = (
        "Mark UNVERIFIED reports older than REPORT_DECAY_DAYS days that have no "
        "interactions as PASSIVE. Records a StatusChange row with reason 'Auto-decayed'."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            '--dry-run',
            action='store_true',
            help='List qualifying report ids without modifying the database.',
        )

    def handle(self, *args, **options):
        cutoff = timezone.now() - datetime.timedelta(days=settings.REPORT_DECAY_DAYS)

        qualifying_ids = list(
            Report.objects.filter(
                status=ReportStatus.UNVERIFIED,
                created_at__lt=cutoff,
                interactions__isnull=True,
            ).values_list('id', flat=True).distinct()
        )

        if options['dry_run']:
            self.stdout.write(
                f"[dry-run] {len(qualifying_ids)} report(s) would decay: {qualifying_ids}"
            )
            return

        decayed = 0
        for report_id in qualifying_ids:
            with transaction.atomic():
                report = Report.objects.select_for_update().get(pk=report_id)
                # Re-check inside the lock — another process may have changed state.
                if report.status != ReportStatus.UNVERIFIED:
                    continue
                if report.interactions.exists():
                    continue

                old_status = report.status
                report.status = ReportStatus.PASSIVE
                report.save(update_fields=['status', 'updated_at'])

                StatusChange.objects.create(
                    report=report,
                    changed_by=report.reporter,
                    old_status=old_status,
                    new_status=ReportStatus.PASSIVE,
                    reason='Auto-decayed',
                )

                report_status_changed.send(
                    sender=Report,
                    report=report,
                    old_status=old_status,
                    new_status=ReportStatus.PASSIVE,
                    actor=None,
                )
                decayed += 1

        self.stdout.write(self.style.SUCCESS(f"Decayed {decayed} report(s)."))
