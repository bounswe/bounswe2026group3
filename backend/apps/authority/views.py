from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.permissions import IsAuthority
from apps.reports.models import Report

from .selectors import get_dashboard_reports, get_dashboard_status_counts
from .serializers import (
    DashboardCountsSerializer,
    DashboardReportSerializer,
    ResolveReportResponseSerializer,
    ResolveReportSerializer,
)
from .services import ReportAlreadyResolvedError, resolve_report


DEFAULT_PAGE_SIZE = 20
MAX_PAGE_SIZE = 100


class ResolveReportView(APIView):
    permission_classes = [IsAuthority]

    def patch(self, request, report_id):
        serializer = ResolveReportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        try:
            report = resolve_report(
                actor=request.user,
                report_id=report_id,
                repair_photo=serializer.validated_data['repair_photo'],
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


class DashboardView(APIView):
    permission_classes = [IsAuthority]

    def get(self, request):
        status_filter = request.query_params.get('status') or None
        try:
            page = max(1, int(request.query_params.get('page', '1')))
            size = min(
                MAX_PAGE_SIZE,
                max(1, int(request.query_params.get('size', str(DEFAULT_PAGE_SIZE)))),
            )
        except ValueError:
            return Response(
                {'detail': 'page and size must be positive integers.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        qs = get_dashboard_reports(status_filter)
        total_items = qs.count()

        offset = (page - 1) * size
        page_items = qs[offset:offset + size]

        return Response({
            'reports': DashboardReportSerializer(page_items, many=True).data,
            'pagination': {
                'page': page,
                'size': size,
                'totalItems': total_items,
            },
            'counts': DashboardCountsSerializer(get_dashboard_status_counts()).data,
        })
