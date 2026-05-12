from django.conf import settings
from django.db import models


class NotificationType(models.TextChoices):
    REPORT_VERIFIED = 'REPORT_VERIFIED', 'Report Verified'
    REPORT_RESOLVED = 'REPORT_RESOLVED', 'Report Resolved'
    REPORT_CLOSED = 'REPORT_CLOSED', 'Report Closed'


class Notification(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='notifications',
    )
    notification_type = models.CharField(max_length=25, choices=NotificationType.choices)
    message = models.TextField()
    is_read = models.BooleanField(default=False)
    related_report = models.ForeignKey(
        'reports.Report',
        on_delete=models.CASCADE,
        related_name='notifications',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'notifications'
        indexes = [
            models.Index(fields=['user', '-created_at'], name='notifications_user_recent_idx'),
        ]

    def __str__(self):
        return f'{self.notification_type} for {self.user.email}'
