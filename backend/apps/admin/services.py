from django.db import transaction

from apps.reports.models import Report
from apps.trust_scores.services import apply_malicious_deletion_delta


@transaction.atomic
def delete_report_as_malicious(report_id):
    """Delete a report flagged as malicious and penalize the reporter's trust score.

    Decrement and deletion run in one transaction so they succeed or roll back together.
    Raises Report.DoesNotExist if the id is unknown.
    """
    report = Report.objects.select_related('reporter').get(pk=report_id)
    reporter = report.reporter
    new_score = apply_malicious_deletion_delta(reporter)
    report.delete()
    return {'reporter_id': reporter.pk, 'trust_score': new_score}
