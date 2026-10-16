"""
Phase 20 — formal automated test suite for the advisory app.

Converts Phase 17's 20-point live-server authorization sweep into a
permanent regression suite: ownership, the owner-vs-admin answer split,
mass-assignment protection, and the disabled PUT method.

Low-confidence expert-notification tests (`AdvisoryNotifyAdminsTests`)
were added after Phase 20 -- see advisory/utils.py.
"""
from django.contrib.auth import get_user_model
from django.core import mail
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from crops.models import Crop, Disease
from scans.models import ScanHistory
from .models import AdvisoryQuery

User = get_user_model()


def make_user(username, email, role=User.Role.FARMER):
    user = User.objects.create_user(username=username, email=email, password="FarmerPass#123", role=role)
    user.is_verified = True
    user.save(update_fields=["is_verified"])
    return user


def make_scan(user, confidence, with_disease=True):
    disease = None
    if with_disease:
        crop = Crop.objects.create(name=f"Rice-{user.username}")
        disease = Disease.objects.create(crop=crop, name="Brown Spot")
    return ScanHistory.objects.create(user=user, predicted_disease=disease, confidence=confidence)


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


class AdvisoryScanLinkOwnershipTests(APITestCase):
    """`scan` is the optional link set by the low-confidence nudge; a
    farmer must never be able to attach a scan that isn't theirs."""

    def setUp(self):
        self.farmer = make_user("farmer_ravi", "ravi@example.com")
        self.other_farmer = make_user("farmer_asha", "asha@example.com")
        self.my_scan = make_scan(self.farmer, confidence=0.3)
        self.their_scan = make_scan(self.other_farmer, confidence=0.3)
        self.url = reverse("advisory-list-create")

    def test_farmer_can_attach_their_own_scan(self):
        self.client.force_authenticate(self.farmer)
        response = self.client.post(self.url, {"question": "What's wrong?", "scan": self.my_scan.id}, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        query = AdvisoryQuery.objects.get()
        self.assertEqual(query.scan_id, self.my_scan.id)

    def test_farmer_cannot_attach_another_farmers_scan(self):
        self.client.force_authenticate(self.farmer)
        response = self.client.post(
            self.url, {"question": "What's wrong?", "scan": self.their_scan.id}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(AdvisoryQuery.objects.exists())

    def test_scan_is_optional(self):
        self.client.force_authenticate(self.farmer)
        response = self.client.post(self.url, {"question": "No scan attached."}, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        query = AdvisoryQuery.objects.get()
        self.assertIsNone(query.scan)


class AdvisoryNotifyAdminsTests(APITestCase):
    """A question only pages the admin/expert when it's linked to a scan
    whose own stored confidence is below the threshold -- see
    advisory/utils.py (should_notify_admins, notify_admins_of_pending_query)."""

    def setUp(self):
        self.farmer = make_user("farmer_ravi", "ravi@example.com")
        self.admin1 = make_user("admin_one", "admin1@example.com", role=User.Role.ADMIN)
        self.admin2 = make_user("admin_two", "admin2@example.com", role=User.Role.ADMIN)
        self.url = reverse("advisory-list-create")
        mail.outbox.clear()

    def test_low_confidence_scan_question_emails_every_admin(self):
        scan = make_scan(self.farmer, confidence=0.384)
        self.client.force_authenticate(self.farmer)
        response = self.client.post(
            self.url, {"question": "Is this blast?", "scan": scan.id}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(mail.outbox), 1)
        sent = mail.outbox[0]
        self.assertCountEqual(sent.to, [self.admin1.email, self.admin2.email])
        self.assertIn("Brown Spot", sent.body)
        self.assertIn("38.4%", sent.body)
        self.assertIn("Is this blast?", sent.body)

    def test_confident_scan_question_does_not_notify(self):
        scan = make_scan(self.farmer, confidence=0.848)
        self.client.force_authenticate(self.farmer)
        response = self.client.post(self.url, {"question": "Just curious.", "scan": scan.id}, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(mail.outbox), 0)

    def test_question_without_a_scan_does_not_notify(self):
        self.client.force_authenticate(self.farmer)
        response = self.client.post(self.url, {"question": "General question."}, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(mail.outbox), 0)

    def test_scan_with_no_stored_confidence_does_not_notify(self):
        scan = make_scan(self.farmer, confidence=None)
        self.client.force_authenticate(self.farmer)
        response = self.client.post(self.url, {"question": "Unprocessed scan.", "scan": scan.id}, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(mail.outbox), 0)

    def test_no_admin_accounts_does_not_crash_the_submission(self):
        User.objects.filter(role=User.Role.ADMIN).delete()
        scan = make_scan(self.farmer, confidence=0.3)
        self.client.force_authenticate(self.farmer)
        response = self.client.post(self.url, {"question": "Anyone there?", "scan": scan.id}, format="json")
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(len(mail.outbox), 0)
