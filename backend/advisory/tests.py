"""
Phase 20 — formal automated test suite for the advisory app.

Converts Phase 17's 20-point live-server authorization sweep into a
permanent regression suite: ownership, the owner-vs-admin answer split,
mass-assignment protection, and the disabled PUT method.
"""
from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from .models import AdvisoryQuery

User = get_user_model()


def make_user(username, email, role=User.Role.FARMER):
    user = User.objects.create_user(username=username, email=email, password="FarmerPass#123", role=role)
    user.is_verified = True
    user.save(update_fields=["is_verified"])
    return user


class AdvisoryCreateTests(APITestCase):
    def setUp(self):
        self.farmer = make_user("farmer_ravi", "ravi@example.com")
        self.url = reverse("advisory-list-create")

    def test_farmer_can_create_a_query(self):
        self.client.force_authenticate(self.farmer)
        response = self.client.post(self.url, {"question": "My arecanut leaves are yellowing."}, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        query = AdvisoryQuery.objects.get()
        self.assertEqual(query.farmer, self.farmer)
        self.assertEqual(query.status, AdvisoryQuery.Status.PENDING)

    def test_unauthenticated_cannot_create(self):
        response = self.client.post(self.url, {"question": "test"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_blank_question_is_rejected(self):
        self.client.force_authenticate(self.farmer)
        response = self.client.post(self.url, {"question": "   "}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_mass_assignment_on_create_is_ignored(self):
        """farmer, status, response, and answered_at must always be server-set."""
        other = make_user("farmer_asha", "asha@example.com")
        self.client.force_authenticate(self.farmer)
        response = self.client.post(self.url, {
            "question": "test",
            "farmer": other.id,
            "status": AdvisoryQuery.Status.ANSWERED,
            "response": "smuggled answer",
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        query = AdvisoryQuery.objects.get()
        self.assertEqual(query.farmer, self.farmer)  # not `other`
        self.assertEqual(query.status, AdvisoryQuery.Status.PENDING)
        self.assertEqual(query.response, "")

    def test_injection_style_question_is_stored_as_inert_text(self):
        self.client.force_authenticate(self.farmer)
        payload = "<script>alert(1)</script> and Robert'); DROP TABLE advisory_advisoryquery;--"
        response = self.client.post(self.url, {"question": payload}, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        query = AdvisoryQuery.objects.get()
        self.assertEqual(query.question, payload)  # stored verbatim, as inert text
        self.assertTrue(User.objects.filter(username="farmer_ravi").exists())  # DB intact


class AdvisoryOwnershipAndAnswerTests(APITestCase):
    """The core of Phase 17's authorization design, kept as a permanent regression test."""

    def setUp(self):
        self.farmer = make_user("farmer_ravi", "ravi@example.com")
        self.other_farmer = make_user("farmer_asha", "asha@example.com")
        self.admin = make_user("admin_expert", "admin@example.com", role=User.Role.ADMIN)
        self.query = AdvisoryQuery.objects.create(farmer=self.farmer, question="Help with my crop.")
        self.detail_url = reverse("advisory-detail", args=[self.query.id])

    def test_owner_can_view_their_own_query(self):
        self.client.force_authenticate(self.farmer)
        response = self.client.get(self.detail_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_another_farmer_cannot_view_someone_elses_query(self):
        self.client.force_authenticate(self.other_farmer)
        response = self.client.get(self.detail_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_view_any_query(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get(self.detail_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_farmer_cannot_answer_even_their_own_query(self):
        self.client.force_authenticate(self.farmer)
        response = self.client.patch(self.detail_url, {"response": "self-answer attempt"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)
        self.query.refresh_from_db()
        self.assertEqual(self.query.status, AdvisoryQuery.Status.PENDING)

    def test_admin_can_answer_and_status_is_server_stamped(self):
        self.client.force_authenticate(self.admin)
        response = self.client.patch(self.detail_url, {
            "response": "Apply neem oil weekly.",
            "status": "pending",  # client tries to smuggle a different status -- must be ignored
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.query.refresh_from_db()
        self.assertEqual(self.query.status, AdvisoryQuery.Status.ANSWERED)  # server-set, not client value
        self.assertIsNotNone(self.query.answered_at)
        self.assertEqual(self.query.response, "Apply neem oil weekly.")

    def test_put_is_disabled_on_the_detail_endpoint(self):
        self.client.force_authenticate(self.admin)
        response = self.client.put(self.detail_url, {"response": "x"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_405_METHOD_NOT_ALLOWED)

    def test_unauthenticated_cannot_view_a_query(self):
        response = self.client.get(self.detail_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)


class AdvisoryListTests(APITestCase):
    def setUp(self):
        self.farmer = make_user("farmer_ravi", "ravi@example.com")
        self.other_farmer = make_user("farmer_asha", "asha@example.com")
        self.admin = make_user("admin_expert", "admin@example.com", role=User.Role.ADMIN)
        self.mine = AdvisoryQuery.objects.create(farmer=self.farmer, question="mine")
        self.theirs = AdvisoryQuery.objects.create(farmer=self.other_farmer, question="theirs")
        self.url = reverse("advisory-list-create")

    def test_farmer_only_sees_their_own_queries(self):
        self.client.force_authenticate(self.farmer)
        response = self.client.get(self.url)
        ids = [q["id"] for q in response.data]
        self.assertIn(self.mine.id, ids)
        self.assertNotIn(self.theirs.id, ids)

    def test_admin_sees_all_queries(self):
        self.client.force_authenticate(self.admin)
        response = self.client.get(self.url)
        ids = [q["id"] for q in response.data]
        self.assertIn(self.mine.id, ids)
        self.assertIn(self.theirs.id, ids)

    def test_admin_status_filter(self):
        self.theirs.status = AdvisoryQuery.Status.ANSWERED
        self.theirs.save(update_fields=["status"])
        self.client.force_authenticate(self.admin)
        response = self.client.get(self.url, {"status": "pending"})
        ids = [q["id"] for q in response.data]
        self.assertIn(self.mine.id, ids)
        self.assertNotIn(self.theirs.id, ids)
