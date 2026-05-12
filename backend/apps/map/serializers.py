from django.conf import settings
from rest_framework import serializers

from apps.reports.models import InteractionType
from apps.reports.services import _upvote_threshold_for


class LocationSerializer(serializers.Serializer):
    lat = serializers.DecimalField(max_digits=9, decimal_places=6, source="latitude")
    lng = serializers.DecimalField(max_digits=9, decimal_places=6, source="longitude")


class ObstacleSerializer(serializers.Serializer):
    reportId = serializers.UUIDField(source="id")
    location = serializers.SerializerMethodField()
    category = serializers.CharField()
    context = serializers.CharField()
    status = serializers.CharField()
    title = serializers.CharField()
    description = serializers.CharField()
    isIndoor = serializers.SerializerMethodField()
    upvoteCount = serializers.SerializerMethodField()
    thumbnailUrl = serializers.SerializerMethodField()
    createdAt = serializers.DateTimeField(source="created_at")

    def get_location(self, obj):
        return {"lat": float(obj.latitude), "lng": float(obj.longitude)}

    def get_isIndoor(self, obj):
        return obj.context == 'INDOOR'

    def get_upvoteCount(self, obj):
        return sum(1 for i in obj.interactions.all() if i.interaction_type == InteractionType.UPVOTE)

    def get_thumbnailUrl(self, obj):
        first_photo = next(iter(obj.photos.all()), None)
        return first_photo.image_url if first_photo else None


class PhotoSerializer(serializers.Serializer):
    url = serializers.URLField(source="image_url")
    uploadedAt = serializers.DateTimeField(source="uploaded_at")


class StatusHistorySerializer(serializers.Serializer):
    oldStatus = serializers.CharField(source="old_status")
    newStatus = serializers.CharField(source="new_status")
    changedBy = serializers.EmailField(source="changed_by.email")
    reason = serializers.CharField()
    changedAt = serializers.DateTimeField(source="created_at")


class ObstacleDetailSerializer(serializers.Serializer):
    reportId = serializers.UUIDField(source="id")
    reporterId = serializers.UUIDField(source="reporter.id")
    location = serializers.SerializerMethodField()
    category = serializers.CharField()
    context = serializers.CharField()
    status = serializers.CharField()
    description = serializers.CharField()
    upvoteCount = serializers.SerializerMethodField()
    upvoteThreshold = serializers.SerializerMethodField()
    flagCount = serializers.SerializerMethodField()
    confirmationCount = serializers.SerializerMethodField()
    confirmationThreshold = serializers.SerializerMethodField()
    userUpvoted = serializers.SerializerMethodField()
    userFlagged = serializers.SerializerMethodField()
    userConfirmed = serializers.SerializerMethodField()
    violations = serializers.JSONField(default=list)
    photos = PhotoSerializer(many=True)
    statusHistory = StatusHistorySerializer(many=True, source="status_changes")
    createdAt = serializers.DateTimeField(source="created_at")

    def get_location(self, obj):
        return {"lat": float(obj.latitude), "lng": float(obj.longitude)}

    def get_upvoteCount(self, obj):
        return sum(1 for i in obj.interactions.all() if i.interaction_type == InteractionType.UPVOTE)

    def get_upvoteThreshold(self, obj):
        return _upvote_threshold_for(obj.reporter)

    def get_flagCount(self, obj):
        return sum(1 for i in obj.interactions.all() if i.interaction_type == InteractionType.FLAG)

    def get_confirmationCount(self, obj):
        return sum(1 for i in obj.interactions.all() if i.interaction_type == InteractionType.CONFIRM_RESOLUTION)

    def get_confirmationThreshold(self, obj):
        return settings.RESOLUTION_CONFIRMATION_THRESHOLD

    def _user_has_interaction(self, obj, interaction_type):
        request = self.context.get("request")
        if request is None or not request.user.is_authenticated:
            return False
        user_id = request.user.id
        return any(
            i.user_id == user_id and i.interaction_type == interaction_type
            for i in obj.interactions.all()
        )

    def get_userUpvoted(self, obj):
        return self._user_has_interaction(obj, InteractionType.UPVOTE)

    def get_userFlagged(self, obj):
        return self._user_has_interaction(obj, InteractionType.FLAG)

    def get_userConfirmed(self, obj):
        return self._user_has_interaction(obj, InteractionType.CONFIRM_RESOLUTION)


class CampusLocationSerializer(serializers.Serializer):
    name = serializers.CharField()
    location = serializers.SerializerMethodField()
    category = serializers.CharField()

    def get_location(self, obj):
        if isinstance(obj, dict):
            return {"lat": float(obj["latitude"]), "lng": float(obj["longitude"])}
        return {"lat": float(obj.latitude), "lng": float(obj.longitude)}