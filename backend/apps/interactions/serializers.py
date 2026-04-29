from rest_framework import serializers


class UpvoteResponseSerializer(serializers.Serializer):
    reportId = serializers.UUIDField()
    upvoteCount = serializers.IntegerField()
    status = serializers.CharField()
