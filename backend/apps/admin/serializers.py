from rest_framework import serializers


class AccountActionResponseSerializer(serializers.Serializer):
    userId = serializers.UUIDField()
    accountStatus = serializers.CharField()
    reason = serializers.CharField(allow_blank=True)


class ModerationQueueItemSerializer(serializers.Serializer):
    reportId = serializers.UUIDField(source='id')
    title = serializers.CharField()
    status = serializers.CharField()
    flagCount = serializers.IntegerField(source='flag_count')
    reporterId = serializers.UUIDField(source='reporter_id')
    createdAt = serializers.DateTimeField(source='created_at')
