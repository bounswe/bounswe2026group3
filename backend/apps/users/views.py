from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.views import TokenRefreshView

from rest_framework_simplejwt.tokens import RefreshToken

from .serializers import RegisterResponseSerializer, RegisterSerializer
from .serializers import LoginSerializer, TokenOutputSerializer, LogoutSerializer
from .services import login_user, logout_user
from .throttles import AuthRateThrottle

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