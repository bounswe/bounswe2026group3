from rest_framework import serializers


class ResolveReportSerializer(serializers.Serializer):
    repairPhoto = serializers.CharField(
        source='repair_photo',
        write_only=True,
        help_text='Base64-encoded image (with or without data URL prefix).',
    )
    repairNotes = serializers.CharField(
        source='repair_notes',
        required=False,
        allow_blank=True,
        default='',
    )


class ResolveReportResponseSerializer(serializers.Serializer):
    reportId = serializers.UUIDField(source='id')
    status = serializers.CharField()
    repairPhotoUrl = serializers.CharField(source='repair_photo_url')
    updatedAt = serializers.DateTimeField(source='updated_at')


class DashboardReportSerializer(serializers.Serializer):
    reportId = serializers.UUIDField(source='id')
    title = serializers.CharField()
    description = serializers.CharField()
    category = serializers.CharField()
    context = serializers.CharField()
    status = serializers.CharField()
    location = serializers.SerializerMethodField()
    upvoteCount = serializers.IntegerField(source='upvote_count')
    thumbnailUrl = serializers.SerializerMethodField()
    reporter = serializers.SerializerMethodField()
    createdAt = serializers.DateTimeField(source='created_at')
    updatedAt = serializers.DateTimeField(source='updated_at')

    def get_location(self, obj):
        return {'lat': float(obj.latitude), 'lng': float(obj.longitude)}

    def get_thumbnailUrl(self, obj):
        first = next(iter(obj.photos.all()), None)
        return first.image_url if first else None

    def get_reporter(self, obj):
        return {
            'userId': str(obj.reporter_id),
            'fullName': obj.reporter.full_name,
        }


class DashboardCountsSerializer(serializers.Serializer):
    verified = serializers.IntegerField()
    awaitingValidation = serializers.IntegerField()
    closed = serializers.IntegerField()
    total = serializers.IntegerField()
