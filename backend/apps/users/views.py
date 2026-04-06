from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenRefreshView

from apps.users.serializers import (LoginSerializer, TokenOutputSerializer, LogoutSerializer,
                                    RegisterSerializer, UserProfileSerializer, UserProfileUpdateSerializer)
from apps.users.services import login_user, logout_user
from apps.users.throttles import AuthRateThrottle

from apps.core.permissions import IsPublic, IsUser, IsAuthority

from apps.users.serializers import RegisterResponseSerializer


class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        refresh = RefreshToken.for_user(user)

        response_serializer = RegisterResponseSerializer(user, context={
            'access_token': str(refresh.access_token),
            'refresh_token': str(refresh),
        })

        return Response(response_serializer.data, status=status.HTTP_201_CREATED)

class LoginView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [AuthRateThrottle]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        tokens = login_user(**serializer.validated_data)

        return Response(TokenOutputSerializer(tokens).data, status=status.HTTP_200_OK)


class RefreshView(TokenRefreshView):
    throttle_classes = [AuthRateThrottle]


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [AuthRateThrottle]

    def post(self, request):
        serializer = LogoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        logout_user(refresh_token=serializer.validated_data['refresh'])

        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        serializer = UserProfileSerializer(request.user)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def put(self, request):
        serializer = UserProfileUpdateSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(UserProfileSerializer(user).data, status=status.HTTP_200_OK)


# For permission testing purposes
class ReportsView(APIView):
    permission_classes = [IsUser]

    def post(self, request):
        return Response({'message': 'Reports endpoint'}, status=status.HTTP_200_OK)

class MapObstaclesView(APIView):
    permission_classes = [IsPublic]

    def get(self, request):
        return Response({'message': 'Map obstacles endpoint'}, status=status.HTTP_200_OK)

class AuthorityDashboardView(APIView):
    permission_classes = [IsAuthority]

    def get(self, request):
        return Response({'message': 'Authority dashboard'}, status=status.HTTP_200_OK)