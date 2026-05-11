from rest_framework import serializers

from .models import Comment, ObstacleCategory, ReportContext


class LocationSerializer(serializers.Serializer):
    lat = serializers.DecimalField(max_digits=9, decimal_places=6)
    lng = serializers.DecimalField(max_digits=9, decimal_places=6)


class ReportSerializer(serializers.Serializer):
    location = LocationSerializer()
    context = serializers.ChoiceField(choices=ReportContext.choices)
    category = serializers.ChoiceField(
        choices=ObstacleCategory.choices,
        allow_null=True,
        required=False,
    )
    description = serializers.CharField(allow_blank=True, required=False, default="")
    photos = serializers.ListField(
        child=serializers.CharField(),
        min_length=1,
        max_length=3,
    )

class ReportResponseSerializer(serializers.Serializer):
    reportId = serializers.UUIDField(source="id")
    status = serializers.CharField()
    autoVerified = serializers.SerializerMethodField()
    duplicateCandidate = serializers.SerializerMethodField()
    createdAt = serializers.DateTimeField(source="created_at")

    def get_autoVerified(self, obj):
        return self.context.get("autoVerified", False)

    def get_duplicateCandidate(self, obj):
        return self.context.get("duplicateCandidate", None)


class UpvoteResponseSerializer(serializers.Serializer):
    reportId = serializers.UUIDField()
    upvoteCount = serializers.IntegerField()
    upvoteThreshold = serializers.IntegerField()
    userUpvoted = serializers.BooleanField()
    status = serializers.CharField()
    autoVerified = serializers.BooleanField()


class FlagResponseSerializer(serializers.Serializer):
    reportId = serializers.UUIDField()
    flagCount = serializers.IntegerField()
    userFlagged = serializers.BooleanField()


class ConfirmResolutionResponseSerializer(serializers.Serializer):
    reportId = serializers.UUIDField()
    confirmationCount = serializers.IntegerField()
    confirmationThreshold = serializers.IntegerField()
    status = serializers.CharField()


class CommentAuthorSerializer(serializers.Serializer):
    userId = serializers.UUIDField(source='id')
    fullName = serializers.CharField(source='full_name')
    role = serializers.CharField()
    mobilityAidType = serializers.SerializerMethodField()

    def get_mobilityAidType(self, user):
        profile = getattr(user, 'mobility_profile', None)
        if profile is None:
            return None
        aid = profile.mobility_aid_type
        return None if aid == 'NONE' else aid


class CommentSerializer(serializers.ModelSerializer):
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    author = CommentAuthorSerializer(read_only=True)

    class Meta:
        model = Comment
        fields = ['id', 'body', 'createdAt', 'author']
        read_only_fields = ['id', 'createdAt', 'author']


class CommentCreateSerializer(serializers.Serializer):
    body = serializers.CharField(min_length=1, max_length=2000)
