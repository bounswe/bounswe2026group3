from rest_framework import serializers


class ModerationQueueItemSerializer(serializers.Serializer):
    reportId = serializers.UUIDField(source='id')
    title = serializers.CharField()
    status = serializers.CharField()
    flagCount = serializers.IntegerField(source='flag_count')
    reporterId = serializers.UUIDField(source='reporter_id')
    createdAt = serializers.DateTimeField(source='created_at')
