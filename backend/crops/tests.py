"""
Phase 20 — formal automated test suite for the crops app.

Covers the public, read-only crop/disease catalog (Phase 7 + Phase 11) and
the Phase 18 translated-field fallback behavior.
"""
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from .models import Crop, Disease, Recommendation


class CropListTests(APITestCase):
    def setUp(self):
        self.arecanut = Crop.objects.create(
            name="Arecanut", soil_type="Laterite", climate="Humid",
            name_kn="ಅಡಿಕೆ", name_hi="",  # deliberately blank Hindi, to test fallback
        )
        self.pepper = Crop.objects.create(name="Black Pepper", soil_type="Laterite", climate="Humid")
        self.url = reverse("crop-list")

    def test_list_is_public_no_auth_required(self):
        response = self.client.get(self.url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 2)

    def test_search_filters_by_name(self):
        response = self.client.get(self.url, {"search": "areca"})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        names = [c["name"] for c in response.data]
        self.assertEqual(names, ["Arecanut"])

    def test_translated_fields_present_and_blank_when_untranslated(self):
        response = self.client.get(self.url)
        arecanut_data = next(c for c in response.data if c["name"] == "Arecanut")
        self.assertEqual(arecanut_data["name_kn"], "ಅಡಿಕೆ")
        self.assertEqual(arecanut_data["name_hi"], "")  # blank, not missing -- frontend does the fallback


class CropDetailTests(APITestCase):
    def setUp(self):
        self.arecanut = Crop.objects.create(name="Arecanut", soil_type="Laterite", climate="Humid")
        self.pepper = Crop.objects.create(name="Black Pepper", soil_type="Laterite", climate="Humid")
        self.arecanut.intercropped_with.add(self.pepper)
        self.disease = Disease.objects.create(
            crop=self.arecanut, name="Yellow Leaf Disease",
            symptoms="Yellowing fronds", description="A common viral disease.", prevention="Remove infected palms.",
        )

    def test_detail_is_public_no_auth_required(self):
        response = self.client.get(reverse("crop-detail", args=[self.arecanut.id]))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["name"], "Arecanut")

    def test_intercropped_with_relationship_is_symmetrical(self):
        # Adding Pepper to Arecanut's list should make Arecanut show up in
        # Pepper's list too (ManyToMany to self, added from one side).
        response = self.client.get(reverse("crop-detail", args=[self.pepper.id]))
        companion_names = [c["name"] for c in response.data["intercropped_with"]]
        self.assertIn("Arecanut", companion_names)

    def test_unknown_crop_id_is_a_404(self):
        response = self.client.get(reverse("crop-detail", args=[999999]))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class DiseaseDetailTests(APITestCase):
    def setUp(self):
        self.crop = Crop.objects.create(name="Rice")
        self.disease = Disease.objects.create(
            crop=self.crop, name="Blast", symptoms="Lesions", description="Fungal.", prevention="Resistant varieties.",
        )
        Recommendation.objects.create(
            disease=self.disease, treatment_info="Apply fungicide.", preventive_measures="Crop rotation.",
        )

    def test_disease_detail_is_public_and_includes_recommendation(self):
        response = self.client.get(reverse("disease-detail", args=[self.disease.id]))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["name"], "Blast")
        self.assertIn("recommendation", response.data)
        self.assertEqual(response.data["recommendation"]["treatment_info"], "Apply fungicide.")
