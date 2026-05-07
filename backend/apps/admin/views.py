from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import IsAdmin
from apps.reports.models import Report
from apps.users.models import User

from .selectors import get_moderation_queue
from .serializers import AccountActionResponseSerializer, ModerationQueueItemSerializer
from .services import ban_user, delete_report_as_malicious, suspend_user


class ModerationQueueView(APIView):
    permission_classes = [IsAdmin]

    def get(self, request):
        reports = get_moderation_queue()
        serializer = ModerationQueueItemSerializer(reports, many=True)
        return Response({'reports': serializer.data, 'total': reports.count()})


class DeleteReportView(APIView):
    permission_classes = [IsAdmin]

    def delete(self, request, report_id):
        try:
            result = delete_report_as_malicious(report_id)
        except Report.DoesNotExist:
            return Response(
                {'detail': 'Report not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(result, status=status.HTTP_200_OK)


class SuspendUserView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request, user_id):
        reason = request.data.get('reason', '')
        try:
            result = suspend_user(user_id, reason)
        except User.DoesNotExist:
            return Response(
                {'detail': 'User not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(AccountActionResponseSerializer(result).data, status=status.HTTP_200_OK)


class BanUserView(APIView):
    permission_classes = [IsAdmin]

    def post(self, request, user_id):
        reason = request.data.get('reason', '')
        try:
            result = ban_user(user_id, reason)
        except User.DoesNotExist:
            return Response(
                {'detail': 'User not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(AccountActionResponseSerializer(result).data, status=status.HTTP_200_OK)
