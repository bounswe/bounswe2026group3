from rest_framework import serializers


class PreferencesSerializer(serializers.Serializer):
    avoidStairs = serializers.BooleanField(required=False, default=False)
    avoidSteepSlopes = serializers.BooleanField(required=False, default=False)
    maxSlopeGradient = serializers.FloatField(required=False, default=None, allow_null=True)


class RouteRequestSerializer(serializers.Serializer):
    originLat = serializers.FloatField()
    originLng = serializers.FloatField()
    destinationLat = serializers.FloatField()
    destinationLng = serializers.FloatField()
    preferences = PreferencesSerializer(required=False)


class RouteResponseSerializer(serializers.Serializer):
    waypoints = serializers.ListField()
    distanceMeters = serializers.FloatField()
    estimatedTimeSeconds = serializers.FloatField()
    avoidedObstaclesCount = serializers.IntegerField()
    warnings = serializers.ListField(child=serializers.CharField())
    isAccessible = serializers.BooleanField()
