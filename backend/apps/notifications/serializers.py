from rest_framework import serializers

from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    type = serializers.CharField(source='notification_type', read_only=True)
    reportId = serializers.UUIDField(source='related_report_id', read_only=True)
    isRead = serializers.BooleanField(source='is_read', read_only=True)
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)

    class Meta:
        model = Notification
        fields = ['id', 'type', 'reportId', 'message', 'isRead', 'createdAt']
        read_only_fields = fields
