from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from .models import MobilityAidType, MobilityProfile, User


class MobilityProfileSerializer(serializers.Serializer):
    mobilityAidType = serializers.ChoiceField(
        choices=MobilityAidType.choices,
        source='mobility_aid_type',
    )
    additionalNeeds = serializers.CharField(
        source='additional_needs',
        required=False,
        default='',
    )
    avoidStairs = serializers.BooleanField(
        source='avoid_stairs',
        required=False,
        default=False,
    )
    avoidSteepSlopes = serializers.BooleanField(
        source='avoid_steep_slopes',
        required=False,
        default=False,
    )
    maxSlopeGradient = serializers.FloatField(
        source='max_slope_gradient',
        required=False,
        default=None,
        allow_null=True,
    )


class RegisterSerializer(serializers.Serializer):
    email = serializers.EmailField()
    fullName = serializers.CharField(max_length=255, source='full_name')
    password = serializers.CharField(write_only=True, min_length=8)
    birthDate = serializers.DateField(source='birth_date', required=False)
    mobilityProfile = MobilityProfileSerializer(
        source='mobility_profile',
        required=False,
    )

    def validate_email(self, value):
        if User.objects.filter(email=value).exists():
            raise serializers.ValidationError('A user with this email already exists.')
        return value

    def validate_password(self, value):
        validate_password(value)
        return value

    def create(self, validated_data):
        mobility_data = validated_data.pop('mobility_profile', None)

        user = User.objects.create_user(
            email=validated_data['email'],
            full_name=validated_data['full_name'],
            password=validated_data['password'],
            birth_date=validated_data.get('birth_date'),
        )

        if mobility_data:
            MobilityProfile.objects.create(user=user, **mobility_data)

        return user


class RegisterResponseSerializer(serializers.ModelSerializer):
    userId = serializers.UUIDField(source='id')
    fullName = serializers.CharField(source='full_name')
    trustScore = serializers.IntegerField(source='reputation_points')
    createdAt = serializers.DateTimeField(source='created_at')
    accessToken = serializers.SerializerMethodField()
    refreshToken = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['userId', 'email', 'fullName', 'account_status', 'trustScore',
                  'accessToken', 'refreshToken', 'createdAt']

    def get_accessToken(self, obj):
        return self.context.get('access_token', '')

    def get_refreshToken(self, obj):
        return self.context.get('refresh_token', '')

class LoginSerializer(serializers.Serializer):
    email = serializers.EmailField()
    password = serializers.CharField(write_only=True)


class TokenOutputSerializer(serializers.Serializer):
    access = serializers.CharField()
    refresh = serializers.CharField()


class LogoutSerializer(serializers.Serializer):
    refresh = serializers.CharField()


class UserProfileSerializer(serializers.ModelSerializer):
    userId = serializers.UUIDField(source='id', read_only=True)
    fullName = serializers.CharField(source='full_name', read_only=True)
    birthDate = serializers.DateField(source='birth_date', read_only=True)
    accountStatus = serializers.CharField(source='account_status', read_only=True)
    reputationPoints = serializers.IntegerField(source='reputation_points', read_only=True)
    notificationsEnabled = serializers.BooleanField(source='notifications_enabled', read_only=True)
    createdAt = serializers.DateTimeField(source='created_at', read_only=True)
    mobilityProfile = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['userId', 'email', 'fullName', 'birthDate', 'role',
                  'accountStatus', 'reputationPoints', 'notificationsEnabled',
                  'createdAt', 'mobilityProfile']

    def get_mobilityProfile(self, obj):
        try:
            profile = obj.mobility_profile
        except MobilityProfile.DoesNotExist:
            return None
        return MobilityProfileSerializer(profile).data


class UserProfileUpdateSerializer(serializers.Serializer):
    fullName = serializers.CharField(source='full_name', max_length=255, required=False)
    birthDate = serializers.DateField(source='birth_date', required=False)
    notificationsEnabled = serializers.BooleanField(source='notifications_enabled', required=False)

    def update(self, instance, validated_data):
        update_fields = []
        if 'full_name' in validated_data:
            instance.full_name = validated_data['full_name']
            update_fields.append('full_name')
        if 'birth_date' in validated_data:
            instance.birth_date = validated_data['birth_date']
            update_fields.append('birth_date')
        if 'notifications_enabled' in validated_data:
            instance.notifications_enabled = validated_data['notifications_enabled']
            update_fields.append('notifications_enabled')
        if update_fields:
            instance.save(update_fields=update_fields)
        return instance


class PasswordResetRequestSerializer(serializers.Serializer):
    email = serializers.EmailField()


class PasswordResetConfirmSerializer(serializers.Serializer):
    token = serializers.CharField()
    password = serializers.CharField(min_length=8, write_only=True)

    def validate_password(self, value):
        validate_password(value)
        return value