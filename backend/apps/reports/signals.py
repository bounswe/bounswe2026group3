from django.dispatch import Signal

# Sent when a Report transitions from one status to another.
# Kwargs: report (Report), old_status (str), new_status (str), actor (User | None).
# Receivers should defer side-effects via transaction.on_commit so they don't
# run inside the caller's transaction (and don't fire on rollback).
report_status_changed = Signal()
