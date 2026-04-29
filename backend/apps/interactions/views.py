from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import IsUser

from .serializers import UpvoteResponseSerializer
from .services import upvote_report


class ReportUpvoteView(APIView):
    permission_classes = [IsUser]

    def post(self, request, report_id):
        result = upvote_report(request.user, report_id)
        return Response(UpvoteResponseSerializer(result).data, status=status.HTTP_200_OK)
