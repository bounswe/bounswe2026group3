from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny

from .selectors import get_obstacles_in_bbox, get_obstacle_detail, search_campus_locations
from .serializers import ObstacleSerializer, ObstacleDetailSerializer, CampusLocationSerializer


class ObstacleListView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        bbox = request.query_params.get("bbox", "")
        include_passive = request.query_params.get("includePassive", "false").lower() == "true"
        status_filter = request.query_params.get("status", None)

        try:
            sw_lat, sw_lng, ne_lat, ne_lng = [float(x) for x in bbox.split(",")]
        except (ValueError, AttributeError):
            return Response(
                {"detail": "bbox query param is required in format: sw_lat,sw_lng,ne_lat,ne_lng"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        obstacles = get_obstacles_in_bbox(sw_lat, sw_lng, ne_lat, ne_lng, include_passive, status_filter)
        serializer = ObstacleSerializer(obstacles, many=True)
        return Response({"obstacles": serializer.data, "total": obstacles.count()})


class ObstacleDetailView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, obstacle_id):
        obstacle = get_obstacle_detail(obstacle_id)
        if obstacle is None:
            return Response({"detail": "Not found."}, status=status.HTTP_404_NOT_FOUND)

        serializer = ObstacleDetailSerializer(obstacle)
        return Response(serializer.data)


class SearchView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        query = request.query_params.get("q", "").strip()
        if not query:
            return Response(
                {"detail": "Query parameter 'q' is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        results = search_campus_locations(query)
        serializer = CampusLocationSerializer(results, many=True)
        return Response({"results": serializer.data})
