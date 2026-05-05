from rest_framework import serializers


class AccountActionResponseSerializer(serializers.Serializer):
    userId = serializers.UUIDField()
    accountStatus = serializers.CharField()
    reason = serializers.CharField(allow_blank=True)
