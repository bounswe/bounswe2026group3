from rest_framework import serializers

from apps.reports.models import InteractionType


class LocationSerializer(serializers.Serializer):
    lat = serializers.DecimalField(max_digits=9, decimal_places=6, source="latitude")
    lng = serializers.DecimalField(max_digits=9, decimal_places=6, source="longitude")


class ObstacleSerializer(serializers.Serializer):
    reportId = serializers.UUIDField(source="id")
    location = serializers.SerializerMethodField()
    category = serializers.CharField()
    context = serializers.CharField()
    status = serializers.CharField()
    upvoteCount = serializers.SerializerMethodField()
    thumbnailUrl = serializers.SerializerMethodField()
    createdAt = serializers.DateTimeField(source="created_at")

    def get_location(self, obj):
        return {"lat": float(obj.latitude), "lng": float(obj.longitude)}

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
    location = serializers.SerializerMethodField()
    category = serializers.CharField()
    context = serializers.CharField()
    status = serializers.CharField()
    description = serializers.CharField()
    upvoteCount = serializers.SerializerMethodField()
    flagCount = serializers.SerializerMethodField()
    photos = PhotoSerializer(many=True)
    statusHistory = StatusHistorySerializer(many=True, source="status_changes")
    createdAt = serializers.DateTimeField(source="created_at")

    def get_location(self, obj):
        return {"lat": float(obj.latitude), "lng": float(obj.longitude)}

    def get_upvoteCount(self, obj):
        return sum(1 for i in obj.interactions.all() if i.interaction_type == InteractionType.UPVOTE)

    def get_flagCount(self, obj):
        return sum(1 for i in obj.interactions.all() if i.interaction_type == InteractionType.FLAG)


class CampusLocationSerializer(serializers.Serializer):
    name = serializers.CharField()
    location = serializers.SerializerMethodField()
    category = serializers.CharField()

    def get_location(self, obj):
        return {"lat": float(obj.latitude), "lng": float(obj.longitude)}
