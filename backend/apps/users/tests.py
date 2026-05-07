from datetime import timedelta
from unittest.mock import patch

from django.contrib.auth.hashers import check_password, identify_hasher
from django.test import TestCase
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from .models import MobilityProfile, PasswordResetToken, User


class RegisterViewTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.url = '/api/auth/register/'
        self.valid_payload = {
            'email': 'test@example.com',
            'fullName': 'Test User',
            'password': 'SecureP@ss123',
            'birthDate': '1995-06-15',
        }

    def test_register_success(self):
        response = self.client.post(self.url, self.valid_payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        data = response.json()
        self.assertEqual(data['email'], 'test@example.com')
        self.assertEqual(data['fullName'], 'Test User')
        self.assertEqual(data['account_status'], 'ACTIVE')
        self.assertEqual(data['trustScore'], 0)
        self.assertIn('accessToken', data)
        self.assertIn('refreshToken', data)
        self.assertIn('userId', data)
        self.assertIn('createdAt', data)

    def test_register_with_mobility_profile(self):
        payload = {
            **self.valid_payload,
            'mobilityProfile': {
                'mobilityAidType': 'WHEELCHAIR',
                'avoidStairs': True,
                'avoidSteepSlopes': True,
                'maxSlopeGradient': 8.0,
            },
        }
        response = self.client.post(self.url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(email='test@example.com')
        profile = MobilityProfile.objects.get(user=user)
        self.assertEqual(profile.mobility_aid_type, 'WHEELCHAIR')
        self.assertTrue(profile.avoid_stairs)
        self.assertTrue(profile.avoid_steep_slopes)
        self.assertEqual(profile.max_slope_gradient, 8.0)

    def test_register_without_mobility_profile(self):
        response = self.client.post(self.url, self.valid_payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(email='test@example.com')
        self.assertFalse(MobilityProfile.objects.filter(user=user).exists())

    def test_register_duplicate_email(self):
        self.client.post(self.url, self.valid_payload, format='json')
        response = self.client.post(self.url, self.valid_payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_register_missing_email(self):
        payload = {**self.valid_payload}
        del payload['email']
        response = self.client.post(self.url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_register_missing_password(self):
        payload = {**self.valid_payload}
        del payload['password']
        response = self.client.post(self.url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_register_invalid_email(self):
        payload = {**self.valid_payload, 'email': 'not-an-email'}
        response = self.client.post(self.url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_password_is_bcrypt_hashed(self):
        self.client.post(self.url, self.valid_payload, format='json')
        user = User.objects.get(email='test@example.com')
        hasher = identify_hasher(user.password)
        self.assertEqual(hasher.algorithm, 'bcrypt_sha256')
        self.assertTrue(check_password('SecureP@ss123', user.password))


# ---------------------------------------------------------------------------
# Service: request_password_reset
# ---------------------------------------------------------------------------


class RequestPasswordResetServiceTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email='user@test.com', full_name='Test User', password='OldPass123!'
        )

    @patch('apps.users.services.send_mail')
    def test_creates_token_and_sends_email(self, mock_send):
        from apps.users.services import request_password_reset

        request_password_reset('user@test.com')

        self.assertEqual(PasswordResetToken.objects.filter(user=self.user, used=False).count(), 1)
        mock_send.assert_called_once()
        call_kwargs = mock_send.call_args
        self.assertIn('user@test.com', call_kwargs[1]['recipient_list'])

    @patch('apps.users.services.send_mail')
    def test_unknown_email_does_not_raise(self, mock_send):
        from apps.users.services import request_password_reset

        request_password_reset('nobody@test.com')

        mock_send.assert_not_called()
        self.assertEqual(PasswordResetToken.objects.count(), 0)

    @patch('apps.users.services.send_mail')
    def test_previous_unused_tokens_are_invalidated(self, mock_send):
        from apps.users.services import request_password_reset

        request_password_reset('user@test.com')
        request_password_reset('user@test.com')

        self.assertEqual(PasswordResetToken.objects.filter(user=self.user, used=False).count(), 1)
        self.assertEqual(PasswordResetToken.objects.filter(user=self.user, used=True).count(), 1)

    @patch('apps.users.services.send_mail')
    def test_reset_link_contains_token(self, mock_send):
        from apps.users.services import request_password_reset

        request_password_reset('user@test.com')

        token = PasswordResetToken.objects.get(user=self.user, used=False).token
        message = mock_send.call_args[0][1]
        self.assertIn(token, message)


# ---------------------------------------------------------------------------
# Service: confirm_password_reset
# ---------------------------------------------------------------------------


class ConfirmPasswordResetServiceTest(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            email='user@test.com', full_name='Test User', password='OldPass123!'
        )
        self.token = PasswordResetToken.objects.create(
            user=self.user,
            token='validtoken123',
            expires_at=timezone.now() + timedelta(minutes=30),
        )

    def test_valid_token_resets_password(self):
        from apps.users.services import confirm_password_reset

        confirm_password_reset('validtoken123', 'NewSecure@Pass1')

        self.user.refresh_from_db()
        self.assertTrue(check_password('NewSecure@Pass1', self.user.password))
        self.token.refresh_from_db()
        self.assertTrue(self.token.used)

    def test_invalid_token_raises_400(self):
        from apps.core.exceptions import ApplicationError
        from apps.users.services import confirm_password_reset

        with self.assertRaises(ApplicationError) as ctx:
            confirm_password_reset('nonexistent', 'NewSecure@Pass1')
        self.assertEqual(ctx.exception.status_code, 400)

    def test_already_used_token_raises_400(self):
        from apps.core.exceptions import ApplicationError
        from apps.users.services import confirm_password_reset

        self.token.used = True
        self.token.save()

        with self.assertRaises(ApplicationError) as ctx:
            confirm_password_reset('validtoken123', 'NewSecure@Pass1')
        self.assertEqual(ctx.exception.status_code, 400)

    def test_expired_token_raises_400(self):
        from apps.core.exceptions import ApplicationError
        from apps.users.services import confirm_password_reset

        self.token.expires_at = timezone.now() - timedelta(seconds=1)
        self.token.save()

        with self.assertRaises(ApplicationError) as ctx:
            confirm_password_reset('validtoken123', 'NewSecure@Pass1')
        self.assertEqual(ctx.exception.status_code, 400)


# ---------------------------------------------------------------------------
# View: POST /api/auth/password-reset/
# ---------------------------------------------------------------------------


class PasswordResetRequestViewTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.url = '/api/auth/password-reset/'
        self.user = User.objects.create_user(
            email='user@test.com', full_name='Test User', password='OldPass123!'
        )

    @patch('apps.users.services.send_mail')
    def test_returns_200_for_registered_email(self, mock_send):
        response = self.client.post(self.url, {'email': 'user@test.com'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        mock_send.assert_called_once()

    def test_returns_200_for_unknown_email(self):
        response = self.client.post(self.url, {'email': 'ghost@test.com'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_invalid_email_returns_400(self):
        response = self.client.post(self.url, {'email': 'not-an-email'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_missing_email_returns_400(self):
        response = self.client.post(self.url, {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


# ---------------------------------------------------------------------------
# View: POST /api/auth/password-reset/confirm/
# ---------------------------------------------------------------------------


class PasswordResetConfirmViewTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.url = '/api/auth/password-reset/confirm/'
        self.user = User.objects.create_user(
            email='user@test.com', full_name='Test User', password='OldPass123!'
        )
        self.token = PasswordResetToken.objects.create(
            user=self.user,
            token='validtoken123',
            expires_at=timezone.now() + timedelta(minutes=30),
        )

    def test_valid_token_returns_200_and_resets_password(self):
        response = self.client.post(
            self.url, {'token': 'validtoken123', 'password': 'NewSecure@Pass1'}, format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.user.refresh_from_db()
        self.assertTrue(check_password('NewSecure@Pass1', self.user.password))

    def test_invalid_token_returns_400(self):
        response = self.client.post(
            self.url, {'token': 'badtoken', 'password': 'NewSecure@Pass1'}, format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_used_token_returns_400(self):
        self.token.used = True
        self.token.save()
        response = self.client.post(
            self.url, {'token': 'validtoken123', 'password': 'NewSecure@Pass1'}, format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_expired_token_returns_400(self):
        self.token.expires_at = timezone.now() - timedelta(seconds=1)
        self.token.save()
        response = self.client.post(
            self.url, {'token': 'validtoken123', 'password': 'NewSecure@Pass1'}, format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_missing_fields_returns_400(self):
        response = self.client.post(self.url, {'token': 'validtoken123'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_weak_password_returns_400(self):
        response = self.client.post(
            self.url, {'token': 'validtoken123', 'password': '123'}, format='json'
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)


# ---------------------------------------------------------------------------
# View: GET/POST/PUT /api/users/me/mobility-profile
# ---------------------------------------------------------------------------

MOBILITY_URL = '/api/users/me/mobility-profile'


class MobilityProfileViewTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            email='user@test.com', full_name='Test User', password='SecureP@ss123',
        )
        self.valid_payload = {
            'mobilityAid': 'WHEELCHAIR',
            'avoidStairs': True,
            'avoidSteepSlopes': True,
            'maxSlopeGradient': 8.0,
        }

    def test_get_returns_404_when_no_profile(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get(MOBILITY_URL)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_create_profile(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post(MOBILITY_URL, self.valid_payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        data = response.json()
        self.assertEqual(data['mobilityAid'], 'WHEELCHAIR')
        self.assertTrue(data['avoidStairs'])
        self.assertTrue(data['avoidSteepSlopes'])
        self.assertEqual(data['maxSlopeGradient'], 8.0)
        self.assertIn('profileId', data)
        self.assertIn('createdAt', data)

    def test_get_returns_profile_after_create(self):
        self.client.force_authenticate(user=self.user)
        self.client.post(MOBILITY_URL, self.valid_payload, format='json')
        response = self.client.get(MOBILITY_URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json()['mobilityAid'], 'WHEELCHAIR')

    def test_create_duplicate_returns_409(self):
        self.client.force_authenticate(user=self.user)
        self.client.post(MOBILITY_URL, self.valid_payload, format='json')
        response = self.client.post(MOBILITY_URL, self.valid_payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_409_CONFLICT)

    def test_update_profile(self):
        self.client.force_authenticate(user=self.user)
        self.client.post(MOBILITY_URL, self.valid_payload, format='json')
        updated = {
            'mobilityAid': 'ELECTRIC_WHEELCHAIR',
            'avoidStairs': False,
            'avoidSteepSlopes': False,
            'maxSlopeGradient': 5.0,
        }
        response = self.client.put(MOBILITY_URL, updated, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        data = response.json()
        self.assertEqual(data['mobilityAid'], 'ELECTRIC_WHEELCHAIR')
        self.assertFalse(data['avoidStairs'])
        self.assertEqual(data['maxSlopeGradient'], 5.0)

    def test_update_returns_404_when_no_profile(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.put(MOBILITY_URL, self.valid_payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_unauthenticated_returns_401(self):
        response = self.client.get(MOBILITY_URL)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_invalid_mobility_aid_returns_400(self):
        self.client.force_authenticate(user=self.user)
        payload = {**self.valid_payload, 'mobilityAid': 'JETPACK'}
        response = self.client.post(MOBILITY_URL, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
