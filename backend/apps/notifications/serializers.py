from rest_framework import serializers

from .models import Notification


class NotificationSerializer(serializers.ModelSerializer):
    type = serializers.CharField(source='notification_type', read_only=True)
    report_id = serializers.UUIDField(source='related_report_id', read_only=True)

    class Meta:
        model = Notification
        fields = ['id', 'type', 'report_id', 'message', 'is_read', 'created_at']
        read_only_fields = fields
