from django.contrib.auth.hashers import check_password, identify_hasher
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from .models import MobilityProfile, User


class RegisterViewTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.url = '/api/auth/register'
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
        self.assertEqual(data['status'], 'ACTIVE')
        self.assertEqual(data['trustScore'], 0)
        self.assertIn('accessToken', data)
        self.assertIn('refreshToken', data)
        self.assertIn('userId', data)
        self.assertIn('createdAt', data)

    def test_register_with_mobility_profile(self):
        payload = {
            **self.valid_payload,
            'mobilityProfile': {
                'mobilityAid': 'WHEELCHAIR',
                'avoidStairs': True,
                'avoidSteepSlopes': True,
                'maxSlopeGradient': 8.0,
            },
        }
        response = self.client.post(self.url, payload, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        user = User.objects.get(email='test@example.com')
        profile = MobilityProfile.objects.get(user=user)
        self.assertEqual(profile.mobility_aid, 'WHEELCHAIR')
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
