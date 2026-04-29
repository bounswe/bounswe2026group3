import secrets
from datetime import timedelta

from django.conf import settings
from django.contrib.auth import authenticate
from django.core.mail import send_mail
from django.utils import timezone
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


def request_password_reset(email: str) -> None:
    from apps.users.models import PasswordResetToken, User

    try:
        user = User.objects.get(email=email)
    except User.DoesNotExist:
        return

    PasswordResetToken.objects.filter(user=user, used=False).update(used=True)

    token = secrets.token_urlsafe(32)
    expires_at = timezone.now() + timedelta(minutes=settings.PASSWORD_RESET_EXPIRY_MINUTES)
    PasswordResetToken.objects.create(user=user, token=token, expires_at=expires_at)

    reset_url = f"{settings.FRONTEND_URL}/reset-password?token={token}"
    send_mail(
        subject='Reset your password',
        message=(
            f'Hi {user.full_name},\n\n'
            f'Click the link below to reset your password. '
            f'It expires in {settings.PASSWORD_RESET_EXPIRY_MINUTES} minutes.\n\n'
            f'{reset_url}\n\n'
            f'If you did not request this, you can ignore this email.'
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[email],
    )


def confirm_password_reset(token: str, new_password: str) -> None:
    from apps.users.models import PasswordResetToken

    try:
        reset_token = PasswordResetToken.objects.select_related('user').get(token=token)
    except PasswordResetToken.DoesNotExist:
        raise ApplicationError('Invalid or expired reset link.', status_code=400)

    if reset_token.used:
        raise ApplicationError('This reset link has already been used.', status_code=400)

    if timezone.now() > reset_token.expires_at:
        raise ApplicationError('This reset link has expired.', status_code=400)

    user = reset_token.user
    user.set_password(new_password)
    user.save(update_fields=['password'])

    reset_token.used = True
    reset_token.save(update_fields=['used'])