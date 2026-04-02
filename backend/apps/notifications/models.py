from django.conf import settings
from django.db import models


class NotificationType(models.TextChoices):
    REGISTRATION_COMPLETE = "REGISTRATION_COMPLETE", "Registration Complete"
    REPORT_VERIFIED = "REPORT_VERIFIED", "Report Verified"
    REPORT_RESOLVED = "REPORT_RESOLVED", "Report Resolved"
    SPAM_WARNING = "SPAM_WARNING", "Spam Warning"
    STATUS_CHANGE = "STATUS_CHANGE", "Status Change"


class Notification(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    notification_type = models.CharField(
        max_length=25,
        choices=NotificationType.choices,
    )
    title = models.CharField(max_length=255)
    message = models.TextField()
    is_read = models.BooleanField(default=False)
    related_report = models.ForeignKey(
        "reports.Report",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="notifications",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "notifications"

    def __str__(self):
        return f"{self.notification_type} for {self.user.username}"
