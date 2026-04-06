from rest_framework import serializers


class CoordinateSerializer(serializers.Serializer):
    lat = serializers.FloatField()
    lng = serializers.FloatField()


class PreferencesSerializer(serializers.Serializer):
    avoidStairs = serializers.BooleanField(required=False, default=False)
    avoidSteepSlopes = serializers.BooleanField(required=False, default=False)
    maxSlopeGradient = serializers.FloatField(required=False, default=None, allow_null=True)


class RouteRequestSerializer(serializers.Serializer):
    origin = CoordinateSerializer()
    destination = CoordinateSerializer()
    preferences = PreferencesSerializer(required=False)


class RouteResponseSerializer(serializers.Serializer):
    routeId = serializers.CharField()
    polyline = serializers.CharField()
    totalDistanceMeters = serializers.IntegerField()
    estimatedTimeMinutes = serializers.IntegerField()
    avoidedObstacles = serializers.ListField(child=serializers.CharField())
    warnings = serializers.ListField(child=serializers.CharField())
    waypoints = serializers.ListField()
