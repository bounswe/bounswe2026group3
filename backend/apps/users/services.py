from django.contrib.auth import authenticate
from rest_framework_simplejwt.tokens import RefreshToken

from apps.core.exceptions import ApplicationError


def login_user(*, email, password):
    user = authenticate(email=email, password=password)

    if user is None:
        raise ApplicationError('Invalid email or password.', status_code=401)

    if not user.is_active:
        raise ApplicationError('Account is deactivated.', status_code=403)

    refresh = RefreshToken.for_user(user)

    return {
        'access': str(refresh.access_token),
        'refresh': str(refresh),
    }


def logout_user(*, refresh_token):
    try:
        token = RefreshToken(refresh_token)
        token.blacklist()
    except Exception:
        raise ApplicationError('Invalid token.', status_code=400)