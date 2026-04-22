from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import IsAdmin
from apps.reports.models import Report

from .services import delete_report_as_malicious


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
