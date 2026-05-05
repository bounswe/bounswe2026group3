from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .serializers import SavedPlaceSerializer
from .services import (
    SavedPlaceNotFoundError,
    create_saved_place,
    delete_saved_place,
    list_saved_places,
)


class SavedPlaceListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        places = list_saved_places(request.user)
        return Response(SavedPlaceSerializer(places, many=True).data, status=status.HTTP_200_OK)

    def post(self, request):
        serializer = SavedPlaceSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        place = create_saved_place(
            request.user,
            label=data['label'],
            latitude=data['latitude'],
            longitude=data['longitude'],
            address=data.get('address', ''),
        )
        return Response(SavedPlaceSerializer(place).data, status=status.HTTP_201_CREATED)


class SavedPlaceDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, place_id):
        try:
            delete_saved_place(request.user, place_id)
        except SavedPlaceNotFoundError:
            return Response(
                {'detail': 'Saved place not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)
