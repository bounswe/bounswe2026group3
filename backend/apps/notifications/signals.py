from django.db import transaction
from django.dispatch import receiver

from apps.reports.signals import report_status_changed

from .services import create_status_change_notifications


@receiver(report_status_changed)
def handle_report_status_changed(sender, report, old_status, new_status, actor=None, reason=None, **kwargs):
    actor_id = actor.id if actor is not None else None
    transaction.on_commit(
        lambda: create_status_change_notifications(
            report, new_status, actor_id=actor_id, reason=reason,
        )
    )
