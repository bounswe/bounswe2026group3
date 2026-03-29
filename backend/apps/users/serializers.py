from django.contrib.auth.password_validation import validate_password
from rest_framework import serializers

from .models import MobilityProfile, User


class MobilityProfileSerializer(serializers.Serializer):
    mobilityAid = serializers.ChoiceField(
        choices=MobilityProfile.MobilityAid.choices,
        source='mobility_aid',
    )
    avoidStairs = serializers.BooleanField(
        source='avoid_stairs',
        default=False,
    )
    avoidSteepSlopes = serializers.BooleanField(
        source='avoid_steep_slopes',
        default=False,
    )
    maxSlopeGradient = serializers.FloatField(
        source='max_slope_gradient',
        required=False,
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
    trustScore = serializers.IntegerField(source='trust_score')
    createdAt = serializers.DateTimeField(source='created_at')
    accessToken = serializers.SerializerMethodField()
    refreshToken = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['userId', 'email', 'fullName', 'status', 'trustScore',
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