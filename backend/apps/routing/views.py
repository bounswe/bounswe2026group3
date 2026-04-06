from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.routing.serializers import RouteRequestSerializer, RouteResponseSerializer
from apps.routing.services import calculate_route


class CalculateRouteView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RouteRequestSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Resolve preferences
        preferences = data.get('preferences')

        if preferences is None and request.user.is_authenticated:
            profile = getattr(request.user, 'mobility_profile', None)
            if profile:
                preferences = {
                    'avoidStairs': profile.avoid_stairs,
                    'avoidSteepSlopes': profile.avoid_steep_slopes,
                    'maxSlopeGradient': profile.max_slope_gradient,
                }

        if preferences is None:
            preferences = {
                'avoidStairs': False,
                'avoidSteepSlopes': False,
                'maxSlopeGradient': None,
            }

        try:
            result = calculate_route(
                data['originLat'],
                data['originLng'],
                data['destinationLat'],
                data['destinationLng'],
                preferences,
            )
        except ValueError as e:
            return Response(
                {'error': {'code': 'ROUTE_ERROR', 'detail': str(e)}},
                status=status.HTTP_400_BAD_REQUEST,
            )

        response_serializer = RouteResponseSerializer(result)
        return Response(response_serializer.data, status=status.HTTP_200_OK)
