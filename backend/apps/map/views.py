from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny

from .selectors import get_obstacles_in_bbox, get_obstacle_detail
from .serializers import ObstacleSerializer, ObstacleDetailSerializer


class ObstacleListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        bbox = request.query_params.get("bbox", "")
        include_passive = request.query_params.get("includePassive", "false").lower() == "true"

        try:
            west, south, east, north = [float(x) for x in bbox.split(",")]
        except (ValueError, AttributeError):
            return Response(
                {"detail": "bbox query param is required in format: west,south,east,north"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        obstacles = get_obstacles_in_bbox(west, south, east, north, include_passive)
        serializer = ObstacleSerializer(obstacles, many=True)
        return Response({"results": serializer.data})


class ObstacleDetailView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, obstacle_id):
        obstacle = get_obstacle_detail(obstacle_id)
        if obstacle is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = ObstacleDetailSerializer(obstacle)
        return Response(serializer.data)
