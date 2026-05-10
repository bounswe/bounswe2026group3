from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated

from apps.core.permissions import IsUser

from .models import Comment, Report
from .serializers import (
    ReportSerializer, ReportResponseSerializer,
    UpvoteResponseSerializer, FlagResponseSerializer, ConfirmResolutionResponseSerializer,
    CommentSerializer, CommentCreateSerializer,
)
from .services import (
    SelfInteractionError, ConflictingInteractionError,
    NotEligibleToConfirmError, ReportNotAwaitingValidationError,
    create_report, detect_duplicate, auto_verify,
    register_upvote, toggle_flag, register_resolution_confirmation,
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
        except SelfInteractionError:
            return Response(
                {'detail': 'You cannot upvote your own report.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        except ConflictingInteractionError:
            return Response(
                {'detail': 'You cannot upvote a report you have flagged.'},
                status=status.HTTP_409_CONFLICT,
            )
        return Response(UpvoteResponseSerializer(result).data, status=status.HTTP_200_OK)


class ReportFlagView(APIView):
    permission_classes = [IsUser]

    def post(self, request, report_id):
        try:
            result = toggle_flag(request.user, report_id)
        except Report.DoesNotExist:
            return Response(
                {'detail': 'Report not found.'},
                status=status.HTTP_404_NOT_FOUND,
            )
        except SelfInteractionError:
            return Response(
                {'detail': 'You cannot flag your own report.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        except ConflictingInteractionError:
            return Response(
                {'detail': 'You cannot flag a report you have upvoted.'},
                status=status.HTTP_409_CONFLICT,
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


class ReportCommentsView(APIView):
    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsAuthenticated()]
        return [AllowAny()]

    def get(self, request, report_id):
        try:
            report = Report.objects.get(pk=report_id)
        except Report.DoesNotExist:
            return Response({'detail': 'Report not found.'}, status=status.HTTP_404_NOT_FOUND)
        comments = (
            report.comments
            .select_related('author', 'author__mobility_profile')
            .all()
        )
        return Response(CommentSerializer(comments, many=True).data)

    def post(self, request, report_id):
        try:
            report = Report.objects.get(pk=report_id)
        except Report.DoesNotExist:
            return Response({'detail': 'Report not found.'}, status=status.HTTP_404_NOT_FOUND)
        serializer = CommentCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        comment = Comment.objects.create(
            report=report,
            author=request.user,
            body=serializer.validated_data['body'],
        )
        comment.author = request.user
        return Response(CommentSerializer(comment).data, status=status.HTTP_201_CREATED)
