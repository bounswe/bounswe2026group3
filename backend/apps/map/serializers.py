from rest_framework import serializers

from apps.reports.models import InteractionType


class ObstacleSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    category = serializers.CharField()
    context = serializers.CharField()
    status = serializers.CharField()
    latitude = serializers.DecimalField(max_digits=9, decimal_places=6)
    longitude = serializers.DecimalField(max_digits=9, decimal_places=6)
    createdAt = serializers.DateTimeField(source="created_at")


class PhotoItemSerializer(serializers.Serializer):
    url = serializers.URLField(source="image_url")
    uploadedAt = serializers.DateTimeField(source="uploaded_at")


class ObstacleDetailSerializer(serializers.Serializer):
    id = serializers.UUIDField()
    category = serializers.CharField()
    context = serializers.CharField()
    status = serializers.CharField()
    description = serializers.CharField()
    latitude = serializers.DecimalField(max_digits=9, decimal_places=6)
    longitude = serializers.DecimalField(max_digits=9, decimal_places=6)
    createdAt = serializers.DateTimeField(source="created_at")
    photos = PhotoItemSerializer(many=True)
    upvoteCount = serializers.SerializerMethodField()

    def get_upvoteCount(self, obj):
        return sum(
            1 for i in obj.interactions.all()
            if i.interaction_type == InteractionType.UPVOTE
        )
