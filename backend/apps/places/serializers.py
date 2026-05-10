from rest_framework import serializers


class SavedPlaceSerializer(serializers.Serializer):
    id = serializers.UUIDField(read_only=True)
    label = serializers.CharField(max_length=50)
    latitude = serializers.DecimalField(max_digits=12, decimal_places=8)
    longitude = serializers.DecimalField(max_digits=12, decimal_places=8)
    address = serializers.CharField(
        max_length=255, required=False, allow_blank=True, default='',
    )
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
