from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from apps.core.permissions import IsUser

from .serializers import ReportSerializer, ReportResponseSerializer
from .services import create_report, detect_duplicate, auto_verify


class ReportCreateView(APIView):
    permission_classes = [IsUser]

    def post(self, request):
        serializer = ReportSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        report = create_report(request.user, serializer.validated_data)
        duplicate = detect_duplicate(report)
        verified = auto_verify(report)

        response_data = ReportResponseSerializer(report, context={
            "autoVerified": bool(verified),
            "duplicateCandidate": str(duplicate.id) if duplicate else None,
        }).data

        return Response(response_data, status=status.HTTP_201_CREATED)
