import uuid

from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.reports.models import Comment, ObstacleCategory, Report, ReportContext
from apps.users.models import MobilityAidType, MobilityProfile, User


def make_user(email='user@test.com', full_name='Test User'):
    return User.objects.create_user(
        email=email,
        full_name=full_name,
        password='SecureP@ss123',
    )


def make_report(reporter):
    return Report.objects.create(
        reporter=reporter,
        title='Broken Ramp',
        description='Cracked surface',
        category=ObstacleCategory.BROKEN_RAMP,
        context=ReportContext.OUTDOOR,
        latitude='41.0825',
        longitude='29.0510',
    )


class ReportCommentsListTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.reporter = make_user()
        self.report = make_report(self.reporter)
        self.url = f'/api/reports/{self.report.id}/comments/'

    def test_empty_list_for_new_report(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.json(), [])

    def test_returns_comments_ordered_by_created_at(self):
        commenter = make_user('b@test.com', 'B User')
        c1 = Comment.objects.create(report=self.report, author=self.reporter, body='First')
        c2 = Comment.objects.create(report=self.report, author=commenter, body='Second')

        data = self.client.get(self.url).json()
        self.assertEqual(len(data), 2)
        self.assertEqual(data[0]['id'], str(c1.id))
        self.assertEqual(data[1]['id'], str(c2.id))

    def test_comment_shape(self):
        Comment.objects.create(report=self.report, author=self.reporter, body='Hello')
        data = self.client.get(self.url).json()
        c = data[0]
        self.assertIn('id', c)
        self.assertIn('body', c)
        self.assertIn('createdAt', c)
        self.assertIn('author', c)
        author = c['author']
        self.assertIn('userId', author)
        self.assertIn('fullName', author)
        self.assertIn('role', author)
        self.assertIn('mobilityAidType', author)

    def test_author_full_name_and_role(self):
        Comment.objects.create(report=self.report, author=self.reporter, body='Hi')
        data = self.client.get(self.url).json()
        author = data[0]['author']
        self.assertEqual(author['fullName'], self.reporter.full_name)
        self.assertEqual(author['role'], self.reporter.role)

    def test_mobility_aid_type_null_when_no_profile(self):
        Comment.objects.create(report=self.report, author=self.reporter, body='Hi')
        data = self.client.get(self.url).json()
        self.assertIsNone(data[0]['author']['mobilityAidType'])

    def test_mobility_aid_type_null_when_profile_aid_is_none(self):
        MobilityProfile.objects.create(
            user=self.reporter,
            mobility_aid_type=MobilityAidType.NONE,
        )
        Comment.objects.create(report=self.report, author=self.reporter, body='Hi')
        data = self.client.get(self.url).json()
        self.assertIsNone(data[0]['author']['mobilityAidType'])

    def test_mobility_aid_type_returned_when_set(self):
        MobilityProfile.objects.create(
            user=self.reporter,
            mobility_aid_type=MobilityAidType.WHEELCHAIR,
        )
        Comment.objects.create(report=self.report, author=self.reporter, body='Hi')
        data = self.client.get(self.url).json()
        self.assertEqual(data[0]['author']['mobilityAidType'], 'WHEELCHAIR')

    def test_guest_can_list_comments(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_returns_404_for_nonexistent_report(self):
        url = f'/api/reports/{uuid.uuid4()}/comments/'
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class ReportCommentsCreateTest(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.reporter = make_user()
        self.report = make_report(self.reporter)
        self.url = f'/api/reports/{self.report.id}/comments/'

    def test_create_requires_authentication(self):
        response = self.client.post(self.url, {'body': 'Hello'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_authenticated_user_can_post_comment(self):
        self.client.force_authenticate(user=self.reporter)
        response = self.client.post(self.url, {'body': 'Great report!'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_created_comment_appears_in_list(self):
        self.client.force_authenticate(user=self.reporter)
        self.client.post(self.url, {'body': 'My comment'}, format='json')
        data = self.client.get(self.url).json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]['body'], 'My comment')

    def test_response_shape_matches_list_shape(self):
        self.client.force_authenticate(user=self.reporter)
        response = self.client.post(self.url, {'body': 'Shape check'}, format='json')
        c = response.json()
        for field in ('id', 'body', 'createdAt', 'author'):
            self.assertIn(field, c)
        for field in ('userId', 'fullName', 'role', 'mobilityAidType'):
            self.assertIn(field, c['author'])

    def test_empty_body_returns_400(self):
        self.client.force_authenticate(user=self.reporter)
        response = self.client.post(self.url, {'body': ''}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_missing_body_returns_400(self):
        self.client.force_authenticate(user=self.reporter)
        response = self.client.post(self.url, {}, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_mobility_aid_included_in_post_response(self):
        MobilityProfile.objects.create(
            user=self.reporter,
            mobility_aid_type=MobilityAidType.WALKER,
        )
        self.client.force_authenticate(user=self.reporter)
        response = self.client.post(self.url, {'body': 'With aid'}, format='json')
        self.assertEqual(response.json()['author']['mobilityAidType'], 'WALKER')

    def test_returns_404_when_posting_to_nonexistent_report(self):
        self.client.force_authenticate(user=self.reporter)
        url = f'/api/reports/{uuid.uuid4()}/comments/'
        response = self.client.post(url, {'body': 'Hi'}, format='json')
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)
