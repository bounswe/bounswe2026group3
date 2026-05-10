from uuid import uuid4

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.places.models import SavedPlace
from apps.users.models import User


def make_user(email='user@test.com'):
    return User.objects.create_user(email=email, full_name='Test User', password='pass')


def make_place(user, **overrides):
    defaults = dict(
        label='Home',
        latitude='41.083700',
        longitude='29.051000',
        address='Sample address',
    )
    defaults.update(overrides)
    return SavedPlace.objects.create(user=user, **defaults)


LIST_URL = '/api/users/me/saved-places/'


def detail_url(place_id):
    return f'/api/users/me/saved-places/{place_id}/'


# ---------------------------------------------------------------------------
# GET /api/users/me/saved-places/
# ---------------------------------------------------------------------------

class SavedPlaceListTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = make_user()

    def test_unauthenticated_returns_401(self):
        response = self.client.get(LIST_URL)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_authenticated_returns_only_own_places(self):
        other = make_user(email='other@test.com')
        make_place(self.user, label='Home')
        make_place(self.user, label='Work')
        make_place(other, label='Gym')

        self.client.force_authenticate(user=self.user)
        response = self.client.get(LIST_URL)

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        labels = sorted(item['label'] for item in response.json())
        self.assertEqual(labels, ['Home', 'Work'])

    def test_response_shape_matches_frontend_contract(self):
        place = make_place(self.user, label='Home')
        self.client.force_authenticate(user=self.user)

        response = self.client.get(LIST_URL)
        data = response.json()

        self.assertEqual(len(data), 1)
        item = data[0]
        for field in ('id', 'label', 'latitude', 'longitude', 'address', 'createdAt'):
            self.assertIn(field, item)
        self.assertEqual(item['id'], str(place.id))
        self.assertEqual(item['label'], 'Home')

    def test_results_ordered_newest_first(self):
        first = make_place(self.user, label='First')
        second = make_place(self.user, label='Second')

        self.client.force_authenticate(user=self.user)
        response = self.client.get(LIST_URL)

        labels = [item['label'] for item in response.json()]
        self.assertEqual(labels, [second.label, first.label])

    def test_empty_list_when_no_places(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.get(LIST_URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json(), [])


# ---------------------------------------------------------------------------
# POST /api/users/me/saved-places/
# ---------------------------------------------------------------------------

class SavedPlaceCreateTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = make_user()

    def _payload(self, **overrides):
        base = {
            'label': 'Home',
            'latitude': '41.083700',
            'longitude': '29.051000',
            'address': 'Sample address',
        }
        base.update(overrides)
        return base

    def test_unauthenticated_returns_401(self):
        response = self.client.post(LIST_URL, self._payload(), format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_create_returns_201_and_persists(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post(LIST_URL, self._payload(), format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        body = response.json()
        self.assertIn('id', body)
        self.assertEqual(body['label'], 'Home')
        self.assertEqual(body['address'], 'Sample address')
        self.assertEqual(SavedPlace.objects.filter(user=self.user).count(), 1)

    def test_create_scopes_to_authenticated_user(self):
        other = make_user(email='other@test.com')
        self.client.force_authenticate(user=self.user)
        self.client.post(LIST_URL, self._payload(), format='json')

        self.assertEqual(SavedPlace.objects.filter(user=self.user).count(), 1)
        self.assertEqual(SavedPlace.objects.filter(user=other).count(), 0)

    def test_address_optional(self):
        self.client.force_authenticate(user=self.user)
        payload = self._payload()
        del payload['address']

        response = self.client.post(LIST_URL, payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.json()['address'], '')

    def test_label_required(self):
        self.client.force_authenticate(user=self.user)
        payload = self._payload()
        del payload['label']

        response = self.client.post(LIST_URL, payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_latitude_required(self):
        self.client.force_authenticate(user=self.user)
        payload = self._payload()
        del payload['latitude']

        response = self.client.post(LIST_URL, payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_longitude_required(self):
        self.client.force_authenticate(user=self.user)
        payload = self._payload()
        del payload['longitude']

        response = self.client.post(LIST_URL, payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_label_max_length_50(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.post(LIST_URL, self._payload(label='x' * 51), format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_same_label_can_be_saved_multiple_times(self):
        self.client.force_authenticate(user=self.user)

        first = self.client.post(LIST_URL, self._payload(label='Home'), format='json')
        second = self.client.post(LIST_URL, self._payload(label='Home'), format='json')

        self.assertEqual(first.status_code, status.HTTP_201_CREATED)
        self.assertEqual(second.status_code, status.HTTP_201_CREATED)
        self.assertNotEqual(first.json()['id'], second.json()['id'])
        self.assertEqual(
            SavedPlace.objects.filter(user=self.user, label='Home').count(), 2,
        )

    def test_accepts_high_precision_coordinates(self):
        # Browser/expo geolocation returns lat/lng with 8+ decimal places.
        # The DecimalField must accept those without 400ing.
        self.client.force_authenticate(user=self.user)
        payload = self._payload(latitude='41.01145731', longitude='28.97675230')

        response = self.client.post(LIST_URL, payload, format='json')

        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        place = SavedPlace.objects.get(pk=response.json()['id'])
        self.assertEqual(str(place.latitude), '41.01145731')
        self.assertEqual(str(place.longitude), '28.97675230')


# ---------------------------------------------------------------------------
# DELETE /api/users/me/saved-places/{id}/
# ---------------------------------------------------------------------------

class SavedPlaceDeleteTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = make_user()

    def test_unauthenticated_returns_401(self):
        place = make_place(self.user)
        response = self.client.delete(detail_url(place.id))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_owner_can_delete_returns_204(self):
        place = make_place(self.user)
        self.client.force_authenticate(user=self.user)

        response = self.client.delete(detail_url(place.id))

        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(SavedPlace.objects.filter(pk=place.id).exists())

    def test_unknown_id_returns_404(self):
        self.client.force_authenticate(user=self.user)
        response = self.client.delete(detail_url(uuid4()))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_other_users_place_returns_404_not_403(self):
        # Don't leak existence: deleting someone else's place is indistinguishable
        # from deleting one that doesn't exist.
        other = make_user(email='other@test.com')
        place = make_place(other)

        self.client.force_authenticate(user=self.user)
        response = self.client.delete(detail_url(place.id))

        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
        self.assertTrue(SavedPlace.objects.filter(pk=place.id).exists())
