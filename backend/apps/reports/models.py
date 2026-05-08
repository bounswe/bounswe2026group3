import uuid

from django.conf import settings
from django.db import models


class ReportStatus(models.TextChoices):
    UNVERIFIED = "UNVERIFIED", "Unverified"
    PASSIVE = "PASSIVE", "Passive"
    VERIFIED = "VERIFIED", "Verified"
    RESOLVED_AWAITING_VALIDATION = (
        "RESOLVED_AWAITING_VALIDATION",
        "Resolved Awaiting Validation",
    )
    CLOSED = "CLOSED", "Closed"


class ObstacleCategory(models.TextChoices):
    # Outdoor
    BROKEN_RAMP = "BROKEN_RAMP", "Broken Ramp"
    NARROW_SIDEWALK = "NARROW_SIDEWALK", "Narrow Sidewalk"
    DAMAGED_SURFACE = "DAMAGED_SURFACE", "Damaged Surface"
    ROAD_CONSTRUCTION = "ROAD_CONSTRUCTION", "Road Construction"
    BLOCKED_PATH = "BLOCKED_PATH", "Blocked Path"
    # Indoor
    BROKEN_ELEVATOR = "BROKEN_ELEVATOR", "Broken Elevator"
    INACCESSIBLE_RESTROOM = "INACCESSIBLE_RESTROOM", "Inaccessible Restroom"
    NARROW_CORRIDOR = "NARROW_CORRIDOR", "Narrow Corridor"
    HEAVY_DOOR = "HEAVY_DOOR", "Heavy Door"
    SLIPPERY_FLOOR = "SLIPPERY_FLOOR", "Slippery Floor"
    # Shared
    OTHER = "OTHER", "Other"


class InteractionType(models.TextChoices):
    UPVOTE = "UPVOTE", "Upvote"
    FLAG = "FLAG", "Flag"
    CONFIRM_RESOLUTION = "CONFIRM_RESOLUTION", "Confirm Resolution"


class ReportContext(models.TextChoices):
    INDOOR = "INDOOR", "Indoor"
    OUTDOOR = "OUTDOOR", "Outdoor"


class Report(models.Model):
    reporter = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="reports",
    )
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255)
    description = models.TextField()
    category = models.CharField(max_length=25, choices=ObstacleCategory.choices)
    context = models.CharField(
        max_length=10, choices=ReportContext.choices, default=ReportContext.OUTDOOR
    )
    status = models.CharField(
        max_length=35,
        choices=ReportStatus.choices,
        default=ReportStatus.UNVERIFIED,
    )
    latitude = models.DecimalField(max_digits=9, decimal_places=6)
    longitude = models.DecimalField(max_digits=9, decimal_places=6)
    is_indoor = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "reports"

    def __str__(self):
        return self.title


class Photo(models.Model):
    report = models.ForeignKey(Report, on_delete=models.CASCADE, related_name="photos")
    image_url = models.URLField(max_length=500)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "photos"
        # Oldest first, so the original obstacle photo stays as the thumbnail
        # even after a post-repair photo is appended on resolution.
        ordering = ["uploaded_at"]

    def __str__(self):
        return f"Photo for {self.report.title}"


class Interaction(models.Model):
    report = models.ForeignKey(
        Report, on_delete=models.CASCADE, related_name="interactions"
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="interactions",
    )
    interaction_type = models.CharField(max_length=25, choices=InteractionType.choices)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "interactions"
        unique_together = ("report", "user", "interaction_type")

    def __str__(self):
        return f"{self.user.email} - {self.interaction_type} on {self.report.title}"


class StatusChange(models.Model):
    report = models.ForeignKey(
        Report, on_delete=models.CASCADE, related_name="status_changes"
    )
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="status_changes",
    )
    old_status = models.CharField(max_length=35, choices=ReportStatus.choices)
    new_status = models.CharField(max_length=35, choices=ReportStatus.choices)
    reason = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = "status_changes"

    def __str__(self):
        return f"{self.report.title}: {self.old_status} -> {self.new_status}"
