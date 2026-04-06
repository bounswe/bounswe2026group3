from rest_framework import serializers

from .models import ObstacleCategory, ReportContext


class LocationSerializer(serializers.Serializer):
    lat = serializers.DecimalField(max_digits=9, decimal_places=6)
    lng = serializers.DecimalField(max_digits=9, decimal_places=6)


class ReportSerializer(serializers.Serializer):
    location = LocationSerializer()
    context = serializers.ChoiceField(choices=ReportContext.choices)
    category = serializers.ChoiceField(
        choices=ObstacleCategory.choices,
        allow_null=True,
        required=False,
    )
    description = serializers.CharField(allow_blank=True, required=False, default="")
    photos = serializers.ListField(
        child=serializers.CharField(),
        min_length=1,
        max_length=3,
    )

class ReportResponseSerializer(serializers.Serializer):
    reportId = serializers.UUIDField(source="id")
    status = serializers.CharField()
    autoVerified = serializers.SerializerMethodField()
    duplicateCandidate = serializers.SerializerMethodField()
    createdAt = serializers.DateTimeField(source="created_at")

    def get_autoVerified(self, obj):
        return self.context.get("autoVerified", False)

    def get_duplicateCandidate(self, obj):
        return self.context.get("duplicateCandidate", None)
