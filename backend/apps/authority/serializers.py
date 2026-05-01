from rest_framework import serializers


class ResolveReportSerializer(serializers.Serializer):
    repairPhotoUrl = serializers.URLField(source='repair_photo_url')
    repairNotes = serializers.CharField(
        source='repair_notes',
        required=False,
        allow_blank=True,
        default='',
    )


class ResolveReportResponseSerializer(serializers.Serializer):
    reportId = serializers.UUIDField(source='id')
    status = serializers.CharField()
    updatedAt = serializers.DateTimeField(source='updated_at')
