from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from apps.core.permissions import IsUser

from .models import Report
from .serializers import (
    ReportSerializer, ReportResponseSerializer, UpvoteResponseSerializer,
    FlagResponseSerializer, ConfirmResolutionResponseSerializer,
)
from .services import (
    SelfUpvoteError, AlreadyUpvotedError, NotEligibleToConfirmError, ReportNotAwaitingValidationError,
    create_report, detect_duplicate, auto_verify, register_upvote, register_flag, register_resolution_confirmation,
)


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


class ReportUpvoteView(APIView):
    permission_classes = [IsUser]

    def post(self, request, report_id):
        try:
            result = register_upvote(request.user, report_id)
        except Report.DoesNotExist:
            return Response(
                {'detail': 'Report not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        except SelfUpvoteError:
            return Response(
                {'detail': 'You cannot upvote your own report.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        return Response(UpvoteResponseSerializer(result).data, status=status.HTTP_200_OK)


class ReportFlagView(APIView):
    permission_classes = [IsUser]

    def post(self, request, report_id):
        try:
            result = register_flag(request.user, report_id)
        except Report.DoesNotExist:
            return Response(
                {'detail': 'Report not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        except AlreadyUpvotedError:
            return Response(
                {'detail': 'You cannot flag a report you have already upvoted.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return Response(FlagResponseSerializer(result).data, status=status.HTTP_200_OK)


class ConfirmResolutionView(APIView):
    permission_classes = [IsUser]

    def post(self, request, report_id):
        try:
            result = register_resolution_confirmation(request.user, report_id)
        except Report.DoesNotExist:
            return Response(
                {'detail': 'Report not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        except ReportNotAwaitingValidationError:
            return Response(
                {'detail': 'Report is not awaiting resolution validation.'},
                status=status.HTTP_409_CONFLICT,
            )
        except NotEligibleToConfirmError:
            return Response(
                {'detail': 'Only the reporter or an upvoter can confirm resolution.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        return Response(ConfirmResolutionResponseSerializer(result).data, status=status.HTTP_200_OK)
