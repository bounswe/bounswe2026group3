from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import IsAuthority
from apps.reports.models import Report

from .serializers import ResolveReportResponseSerializer, ResolveReportSerializer
from .services import ReportAlreadyResolvedError, resolve_report


class ResolveReportView(APIView):
    permission_classes = [IsAuthority]

    def patch(self, request, report_id):
        serializer = ResolveReportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            report = resolve_report(
                actor=request.user,
                report_id=report_id,
                repair_photo_url=serializer.validated_data['repair_photo_url'],
                repair_notes=serializer.validated_data.get('repair_notes', ''),
            )
        except Report.DoesNotExist:
            return Response(
                {'detail': 'Report not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        except ReportAlreadyResolvedError:
            return Response(
                {'detail': 'Report is already resolved or closed.'},
                status=status.HTTP_409_CONFLICT,
            )

        return Response(
            ResolveReportResponseSerializer(report).data,
            status=status.HTTP_200_OK,
        )
