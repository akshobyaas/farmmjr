# Farming Diary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an AI-analyzed daily diary to each farmer's tracked crop — structured activity
checkboxes, a free-text note, and an optional photo (auto-diagnosed by the existing CNN) — with a
synchronous Google Gemini call on submit giving the farmer back grounded, practical analysis.

**Architecture:** One new Django model (`FarmingDiaryEntry`) scoped through the existing
`FarmerCropTracker`; a thin serializer/view pair following the exact `FarmerCropTracker`
list-create/retrieve-update pattern already in `crops/views.py`; a new pure-function AI module
(`crops/diary_ai.py`) mirroring `weather/forecast.py`'s fail-soft, mockable-in-tests shape; and a new
"Daily Log" section on `CropDetailPage.jsx` reusing the existing tracker-section's conditional
rendering style.

**Tech Stack:** Django 6.1 / DRF (backend), React + Vite + react-i18next (frontend), Google Gemini
REST API via `requests` (no new SDK dependency — same plain-REST style `weather/forecast.py` already
uses against OpenWeatherMap).

**Spec:** `FARMING_DIARY_DESIGN.md` (this repo's root) — the approved design this plan implements.

## Global Constraints

- Activity categories are exactly `irrigation`, `fertilizer`, `spraying`, `pruning`, `other` —
  matching `CropTask.Category` verbatim (do not invent new category strings).
- One `FarmingDiaryEntry` per `(tracker, entry_date)` — enforced by `unique_together`. Resubmitting
  the same day **updates** that row; it never creates a second one and never 500s on the resulting
  `IntegrityError`.
- `tracker` alone scopes a diary entry to one farmer (via `FarmerCropTracker.unique_together("farmer",
  "crop")`) — no separate `farmer` FK on the model.
- Photo diagnosis reuses `scans.ml_model.predict(image_path)` (returns `(label, confidence)` or
  `(None, None)`) and `scans.ml_model.disease_lookup(label)` exactly as `scans/views.py` already
  calls them. No new ML/training work of any kind.
- `GEMINI_API_KEY = env('GEMINI_API_KEY', default='')` in `config/settings.py`, placed and commented
  the same blank-key-fails-soft way as `OPENWEATHER_API_KEY` immediately above it.
- The Gemini call is synchronous, on submit, with a 5-second timeout — matching
  `weather/forecast.py`'s `REQUEST_TIMEOUT_SECONDS`.
- The Gemini call reads the farmer's **last 5** `FarmingDiaryEntry` rows for this tracker (oldest to
  newest) as context, plus the tracker's crop name and `current_stage.name` (if set).
- **The entry always saves, whether or not the AI call succeeds.** Any Gemini failure (blank key,
  network error, timeout, non-200, malformed response) sets `ai_analysis_status = "unavailable"` and
  leaves `ai_analysis` blank — never blocks or fails the save.
- Out of scope this round (do not build): editing a non-today entry, deferred/resurfaced AI
  follow-up questions, multiple photos per entry, voice input.

## Review Focus

- **Ownership (IDOR):** a farmer must never be able to create, read, or update a diary entry on
  another farmer's tracker. A mismatched `tracker` id in the request, or a `pk` in the URL for
  another farmer's entry, must 403/404 — not silently succeed or leak another farmer's data. (Task 2)
- **Same-day resubmission never 500s or duplicates:** posting a second entry for a tracker on a day
  that already has one must update the existing row cleanly, not raise an unhandled
  `IntegrityError` from the `unique_together` constraint. (Task 2)
- **An empty entry is rejected, not silently saved:** submitting with no activities ticked, no
  (non-whitespace) note, and no photo should return a clear validation error — not save a
  completely blank, useless row. (Task 2)
- **An oversized free-text note is rejected with a clear message**, not truncated silently or
  allowed to blow up the Gemini prompt/timeout. Cap at 2000 characters. (Task 2)
- **A farmer's very first diary entry (zero prior history) must not break AI context-building** —
  the "last 5 entries" list is legitimately empty; the prompt-building code must handle that case
  as a normal input, not a special error. (Task 4)

---

### Task 1: `FarmingDiaryEntry` model + migration

**Files:**
- Modify: `backend/crops/models.py` (add `FarmingDiaryEntry` after `FarmerCropTracker`)
- Create: `backend/crops/migrations/00XX_farmingdiaryentry.py` (via `makemigrations`)
- Test: `backend/crops/tests.py` (new `FarmingDiaryEntryModelTests` class)

**Interfaces:**
- Consumes: `FarmerCropTracker` (existing model, `crops/models.py`).
- Produces: `FarmingDiaryEntry` with fields `tracker` (FK), `entry_date` (DateField), `did_irrigation`/
  `did_fertilizer`/`did_spraying`/`did_pruning` (BooleanField, default False),
  `other_activity_note` (CharField, max_length=200, blank=True), `note` (TextField, blank=True),
  `photo` (ImageField, `upload_to="diary_photos/%Y/%m/"`, null=True, blank=True),
  `photo_diagnosis_label` (CharField, max_length=100, blank=True),
  `photo_diagnosis_confidence` (FloatField, null=True),
  `ai_analysis` (TextField, blank=True), `ai_analysis_status` (CharField with choices
  `AnalysisStatus.OK = "ok"` / `AnalysisStatus.UNAVAILABLE = "unavailable"`, default `UNAVAILABLE`),
  `created_at` (DateTimeField, auto_now_add=True). `Meta`: `unique_together = ("tracker",
  "entry_date")`, `ordering = ["-entry_date"]`. Later tasks import this model and
  `FarmingDiaryEntry.AnalysisStatus`.

- [ ] **Step 1: Write the failing test**

```python
class FarmingDiaryEntryModelTests(TestCase):
    def setUp(self):
        self.crop = Crop.objects.create(name="Rice")
        self.farmer = User.objects.create_user(username="farmer1", password="x")
        self.tracker = FarmerCropTracker.objects.create(farmer=self.farmer, crop=self.crop)

    def test_one_entry_per_tracker_per_day_is_enforced(self):
        FarmingDiaryEntry.objects.create(tracker=self.tracker, entry_date=date(2026, 10, 19), note="a")
        with self.assertRaises(IntegrityError):
            FarmingDiaryEntry.objects.create(tracker=self.tracker, entry_date=date(2026, 10, 19), note="b")

    def test_entries_order_most_recent_first(self):
        older = FarmingDiaryEntry.objects.create(tracker=self.tracker, entry_date=date(2026, 10, 10))
        newer = FarmingDiaryEntry.objects.create(tracker=self.tracker, entry_date=date(2026, 10, 19))
        self.assertEqual(list(self.tracker.diary_entries.all()), [newer, older])

    def test_ai_analysis_status_defaults_to_unavailable(self):
        entry = FarmingDiaryEntry.objects.create(tracker=self.tracker, entry_date=date(2026, 10, 19))
        self.assertEqual(entry.ai_analysis_status, FarmingDiaryEntry.AnalysisStatus.UNAVAILABLE)
```

(`related_name="diary_entries"` on the `tracker` FK — confirm this exact name, Task 2's queryset
depends on it.)

- [ ] **Step 2: Run test to verify it fails**

Run: `python manage.py test crops.tests.FarmingDiaryEntryModelTests -v 2`
Expected: FAIL with "FarmingDiaryEntry not defined" (or similar import error).

- [ ] **Step 3: Implement `FarmingDiaryEntry` in `backend/crops/models.py`**

Add directly after the `FarmerCropTracker` class. Use the exact field list, choices class, and
`Meta` options given in the Interfaces block above.

- [ ] **Step 4: Generate and apply the migration**

Run: `python manage.py makemigrations crops`
Run: `python manage.py migrate`

- [ ] **Step 5: Run test to verify it passes**

Run: `python manage.py test crops.tests.FarmingDiaryEntryModelTests -v 2`
Expected: PASS (all 3 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/crops/models.py backend/crops/migrations/ backend/crops/tests.py
git commit -m "feat: add FarmingDiaryEntry model"
```

---

### Task 2: Diary entry serializer, view, and URLs (text/activity fields — no photo/AI yet)

**Files:**
- Modify: `backend/crops/serializers.py` (add `FarmingDiaryEntrySerializer`)
- Modify: `backend/crops/views.py` (add `FarmingDiaryEntryListCreateView`,
  `FarmingDiaryEntryDetailView`)
- Modify: `backend/crops/urls.py` (register the two new views)
- Test: `backend/crops/tests.py` (new `FarmingDiaryEntryAPITests` class)

**Interfaces:**
- Consumes: `FarmingDiaryEntry` (Task 1).
- Produces: `GET/POST /crops/diary/?tracker=<id>` (list entries for one of the farmer's own
  trackers, create-or-update today's entry) and `GET/PATCH /crops/diary/<pk>/` (today's entry only
  — see Step 3). `FarmingDiaryEntrySerializer` fields: `id`, `tracker`, `entry_date` (read-only,
  server-set to today), `did_irrigation`, `did_fertilizer`, `did_spraying`, `did_pruning`,
  `other_activity_note`, `note`, `photo` (present in `fields` now so Task 3 doesn't need a
  migration-free serializer change — but no diagnosis logic wired yet), `photo_diagnosis_label`
  (read-only), `photo_diagnosis_confidence` (read-only), `ai_analysis` (read-only), `ai_analysis_status`
  (read-only). Later tasks (3, 4) extend this serializer's `create`/`update`, not replace it.

- [ ] **Step 1: Write the failing tests**

```python
class FarmingDiaryEntryAPITests(APITestCase):
    def setUp(self):
        self.crop = Crop.objects.create(name="Rice")
        self.farmer = User.objects.create_user(username="farmer1", password="x")
        self.other_farmer = User.objects.create_user(username="farmer2", password="x")
        self.tracker = FarmerCropTracker.objects.create(farmer=self.farmer, crop=self.crop)
        self.other_tracker = FarmerCropTracker.objects.create(farmer=self.other_farmer, crop=self.crop)
        self.client.force_authenticate(user=self.farmer)

    def test_create_entry_for_own_tracker(self):
        resp = self.client.post("/api/crops/diary/", {"tracker": self.tracker.id, "did_irrigation": True, "note": "Watered today."})
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(FarmingDiaryEntry.objects.get().entry_date, date.today())

    def test_resubmitting_same_day_updates_instead_of_duplicating(self):
        self.client.post("/api/crops/diary/", {"tracker": self.tracker.id, "note": "first"})
        resp = self.client.post("/api/crops/diary/", {"tracker": self.tracker.id, "note": "second"})
        self.assertEqual(resp.status_code, 200)  # or 201 -- implementer's call, document which
        self.assertEqual(FarmingDiaryEntry.objects.filter(tracker=self.tracker).count(), 1)
        self.assertEqual(FarmingDiaryEntry.objects.get().note, "second")

    def test_cannot_create_entry_for_another_farmers_tracker(self):
        resp = self.client.post("/api/crops/diary/", {"tracker": self.other_tracker.id, "note": "x"})
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(FarmingDiaryEntry.objects.count(), 0)

    def test_list_only_returns_the_requesting_farmers_entries(self):
        FarmingDiaryEntry.objects.create(tracker=self.tracker, entry_date=date.today(), note="mine")
        FarmingDiaryEntry.objects.create(tracker=self.other_tracker, entry_date=date.today(), note="not mine")
        resp = self.client.get(f"/api/crops/diary/?tracker={self.tracker.id}")
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]["note"], "mine")

    def test_cannot_list_another_farmers_tracker_entries(self):
        resp = self.client.get(f"/api/crops/diary/?tracker={self.other_tracker.id}")
        self.assertIn(resp.status_code, (403, 404))

    def test_empty_entry_is_rejected(self):
        resp = self.client.post("/api/crops/diary/", {"tracker": self.tracker.id})
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(FarmingDiaryEntry.objects.count(), 0)

    def test_note_over_2000_characters_is_rejected(self):
        resp = self.client.post("/api/crops/diary/", {"tracker": self.tracker.id, "note": "x" * 2001})
        self.assertEqual(resp.status_code, 400)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python manage.py test crops.tests.FarmingDiaryEntryAPITests -v 2`
Expected: FAIL (views/urls not defined yet)

- [ ] **Step 3: Implement `FarmingDiaryEntrySerializer` in `backend/crops/serializers.py`**

Follow `FarmerCropTrackerSerializer`'s exact shape: `tracker` writable on create, a `validate()`
override that (a) confirms `attrs["tracker"].farmer == request.user` (raise
`serializers.ValidationError` with a clear message if not — the view's queryset scoping in Step 4
handles reads, but create must check here since `tracker` is an open FK field), (b) rejects an
entry with no activity ticked, no non-whitespace `note`, and no `photo` present, and (c) validates
`len(note) <= 2000`. `entry_date` is not client-writable — `read_only_fields` — the view sets it to
`timezone.localdate()` in `perform_create`/`perform_update`. For the "update today's entry on
resubmit" behavior: `FarmingDiaryEntrySerializer.create()` should look up
`FarmingDiaryEntry.objects.filter(tracker=tracker, entry_date=today).first()` and update-in-place if
found, else create — this keeps the single create endpoint (`POST /crops/diary/`) idempotent per
day without a separate detail-PATCH round trip from the client. Decide and document whether this
returns 200 or 201 on the update path (either is defensible — pick one, the test above accepts
either, but the plan requires you to not leave it ambiguous: write a one-line comment on the
`create()` method stating which and why).

- [ ] **Step 4: Implement the views in `backend/crops/views.py`**

`FarmingDiaryEntryListCreateView(generics.ListCreateAPIView)`: `serializer_class =
FarmingDiaryEntrySerializer`, `permission_classes = [permissions.IsAuthenticated]`. `get_queryset`
filters `FarmingDiaryEntry.objects.filter(tracker__farmer=self.request.user)`, further filtered by
a `?tracker=<id>` query param when present (400 if the param is missing or not an int — mirror
`CropListView.get_queryset`'s style for the query-param handling). `perform_create` does NOT set
`farmer` (there is none on this model) — it just calls `serializer.save()`; the
cross-farmer-tracker check lives in the serializer's `validate()` from Step 3, which must raise a
`PermissionDenied` (not `ValidationError`) to produce the 403 the test expects, exactly the same
"validated in the serializer, surfaced as 403 not 500" pattern used in `FarmerCropTrackerSerializer`
for its own validations but with `PermissionDenied` imported from `rest_framework.exceptions`
instead of `ValidationError`, since this is an ownership check, not a data-shape check.
`FarmingDiaryEntryDetailView(generics.RetrieveAPIView)`: read-only (no PATCH endpoint this round —
the create endpoint's idempotent-per-day behavior from Step 3 is the only write path), scoped via
`get_queryset` the same `tracker__farmer=self.request.user` way.

- [ ] **Step 5: Register URLs in `backend/crops/urls.py`**

```python
path('crops/diary/', FarmingDiaryEntryListCreateView.as_view(), name='farming-diary-list-create'),
path('crops/diary/<int:pk>/', FarmingDiaryEntryDetailView.as_view(), name='farming-diary-detail'),
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `python manage.py test crops.tests.FarmingDiaryEntryAPITests -v 2`
Expected: PASS (all 7 tests)

- [ ] **Step 7: Commit**

```bash
git add backend/crops/serializers.py backend/crops/views.py backend/crops/urls.py backend/crops/tests.py
git commit -m "feat: add Farming Diary entry create/list/detail API"
```

---

### Task 3: Photo upload → CNN diagnosis integration

**Files:**
- Modify: `backend/crops/serializers.py` (`FarmingDiaryEntrySerializer.validate_photo`,
  `create`/`update`)
- Test: `backend/crops/tests.py` (new tests in `FarmingDiaryEntryAPITests`)

**Interfaces:**
- Consumes: `scans.ml_model.predict(image_path: str) -> (label: str | None, confidence: float |
  None)`, `scans.ml_model.disease_lookup(label) -> Disease | None` (both existing, `scans/ml_model.py`).
- Produces: `FarmingDiaryEntry.photo_diagnosis_label`/`photo_diagnosis_confidence` populated
  whenever a photo is attached and a prediction succeeds; left blank/`None` otherwise (no photo, or
  `predict()` returned `(None, None)`).

- [ ] **Step 1: Write the failing tests**

`scans/tests.py` already has a `make_test_image(fmt="JPEG")` helper (builds a real small in-memory
JPEG/PNG via Pillow + `SimpleUploadedFile`) for exactly this purpose. `crops/tests.py` doesn't import
across test modules from other apps — add an equivalent small helper directly in `crops/tests.py`
(same ~6-line implementation, not a cross-app import) rather than reaching into `scans.tests`. This
needs `io`, `from PIL import Image`, and `from django.core.files.uploadedfile import
SimpleUploadedFile` added to `crops/tests.py`'s existing import block (none of the three are there
yet — check before assuming). Mock with the existing `patch`/`Mock` imports already used throughout
`crops/tests.py` (`from unittest.mock import patch` is already imported; add `Mock` to that same
import line) — follow the file's own `@patch("crops.views.fetch_forecast_summary", ...)` style
exactly, not `@mock.patch(...)`.

```python
class FarmingDiaryPhotoDiagnosisTests(APITestCase):
    def setUp(self):
        # same setUp as FarmingDiaryEntryAPITests
        ...

    @patch("scans.ml_model.predict", return_value=("Rice___Blast", 0.91))
    @patch("scans.ml_model.disease_lookup")
    def test_photo_upload_populates_diagnosis_fields(self, mock_lookup, mock_predict):
        mock_lookup.return_value = Mock(name="Blast")
        photo = make_test_image("JPEG")
        resp = self.client.post("/api/crops/diary/", {"tracker": self.tracker.id, "note": "spots", "photo": photo}, format="multipart")
        self.assertEqual(resp.status_code, 201)
        entry = FarmingDiaryEntry.objects.get()
        self.assertEqual(entry.photo_diagnosis_label, "Rice___Blast")
        self.assertAlmostEqual(entry.photo_diagnosis_confidence, 0.91)

    def test_no_photo_leaves_diagnosis_fields_blank(self):
        resp = self.client.post("/api/crops/diary/", {"tracker": self.tracker.id, "note": "no photo today"})
        self.assertEqual(resp.status_code, 201)
        entry = FarmingDiaryEntry.objects.get()
        self.assertEqual(entry.photo_diagnosis_label, "")
        self.assertIsNone(entry.photo_diagnosis_confidence)

    @patch("scans.ml_model.predict", return_value=(None, None))
    def test_photo_upload_with_prediction_unavailable_still_saves_the_entry(self, mock_predict):
        photo = make_test_image("JPEG")
        resp = self.client.post("/api/crops/diary/", {"tracker": self.tracker.id, "note": "x", "photo": photo}, format="multipart")
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(FarmingDiaryEntry.objects.get().photo_diagnosis_label, "")

    def test_non_image_file_is_rejected(self):
        bad_file = SimpleUploadedFile("not-a-photo.txt", b"hello", content_type="text/plain")
        resp = self.client.post("/api/crops/diary/", {"tracker": self.tracker.id, "note": "x", "photo": bad_file}, format="multipart")
        self.assertEqual(resp.status_code, 400)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python manage.py test crops.tests.FarmingDiaryPhotoDiagnosisTests -v 2`
Expected: FAIL (diagnosis fields stay blank / no image validation yet)

- [ ] **Step 3: Implement `validate_photo` on `FarmingDiaryEntrySerializer`**

Mirror `scans.serializers.ScanUploadSerializer.validate_photo` exactly (same
`MAX_UPLOAD_SIZE_BYTES`/`ALLOWED_CONTENT_TYPES`/`ALLOWED_PIL_FORMATS` constants and the same
size-check → content-type-check → Pillow-`img.verify()`-check → filename-sanitization sequence).
Duplicating these ~4 constants and this one validator method into `crops/serializers.py` is the
right call here — these two apps (`scans`, `crops`) aren't otherwise coupled, and a shared-module
extraction is out of scope for this plan; note this explicitly as a deliberate, scoped duplication
in a code comment, not an oversight.

- [ ] **Step 4: Wire the CNN call into `create`/`update`**

After the model instance is saved and has a `photo` on disk, call `scans.ml_model.predict(instance.photo.path)`.
If it returns a real `(label, confidence)`, store both directly on `photo_diagnosis_label` /
`photo_diagnosis_confidence` (the Disease lookup from `disease_lookup()` is only needed later, in
Task 4, to build the AI prompt — don't store the `Disease` object itself on this model, just the raw
label/confidence, exactly as specified in Task 1's field list). If `predict()` returns `(None,
None)`, leave both fields at their defaults. This only runs when `photo` is present on this
save — an update that doesn't touch `photo` must not re-run prediction.

- [ ] **Step 5: Run tests to verify they pass**

Run: `python manage.py test crops.tests.FarmingDiaryPhotoDiagnosisTests -v 2`
Expected: PASS (all 4 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/crops/serializers.py backend/crops/tests.py
git commit -m "feat: run diary photos through the existing CNN for an automatic diagnosis"
```

---

### Task 4: Gemini AI analysis module + wiring

**Files:**
- Create: `backend/crops/diary_ai.py`
- Modify: `backend/config/settings.py` (add `GEMINI_API_KEY`)
- Modify: `backend/crops/serializers.py` or `views.py` (wire the call in after save — implementer's
  choice which file, following whichever existing call site feels more analogous: `risk_engine.py`
  is called from `views.py`, so prefer wiring this from the view's `perform_create`/`perform_update`
  for the same reason)
- Test: `backend/crops/tests.py` (new `DiaryAiTests` class)

**Interfaces:**
- Consumes: `FarmingDiaryEntry` (Task 1), `settings.GEMINI_API_KEY`.
- Produces: `generate_diary_analysis(entry: FarmingDiaryEntry, recent_entries: list[FarmingDiaryEntry]) -> str | None`
  in `crops/diary_ai.py` — returns the AI's text response on success, `None` on any failure (mirrors
  `weather.forecast.fetch_forecast_summary`'s `None`-on-failure contract exactly). The caller (view)
  sets `ai_analysis` / `ai_analysis_status` from this return value — `None` → `UNAVAILABLE` and blank
  `ai_analysis`; a string → `OK` and that string.

- [ ] **Step 1: Write the failing tests**

Use the same `patch`/`Mock` imports as Task 3 (`from unittest.mock import patch, Mock`), and add
`from django.test import override_settings` and `import requests` to `crops/tests.py`'s imports if
not already present (`override_settings` is not currently used anywhere in this file — check before
assuming it is).

```python
class DiaryAiTests(TestCase):
    def setUp(self):
        self.crop = Crop.objects.create(name="Rice")
        self.farmer = User.objects.create_user(username="f1", password="x")
        self.tracker = FarmerCropTracker.objects.create(farmer=self.farmer, crop=self.crop)
        self.entry = FarmingDiaryEntry.objects.create(tracker=self.tracker, entry_date=date.today(), note="leaves look yellow")

    @override_settings(GEMINI_API_KEY="")
    def test_blank_api_key_returns_none(self):
        self.assertIsNone(generate_diary_analysis(self.entry, []))

    @override_settings(GEMINI_API_KEY="fake-key")
    @patch("crops.diary_ai.requests.post")
    def test_successful_call_returns_the_response_text(self, mock_post):
        mock_post.return_value = Mock(status_code=200, json=lambda: {
            "candidates": [{"content": {"parts": [{"text": "Consider checking for nitrogen deficiency."}]}}]
        })
        result = generate_diary_analysis(self.entry, [])
        self.assertEqual(result, "Consider checking for nitrogen deficiency.")

    @override_settings(GEMINI_API_KEY="fake-key")
    @patch("crops.diary_ai.requests.post", side_effect=requests.Timeout)
    def test_timeout_returns_none(self, mock_post):
        self.assertIsNone(generate_diary_analysis(self.entry, []))

    @override_settings(GEMINI_API_KEY="fake-key")
    @patch("crops.diary_ai.requests.post")
    def test_non_200_response_returns_none(self, mock_post):
        mock_post.return_value = Mock(status_code=500)
        self.assertIsNone(generate_diary_analysis(self.entry, []))

    @override_settings(GEMINI_API_KEY="fake-key")
    @patch("crops.diary_ai.requests.post")
    def test_first_ever_entry_with_no_history_still_builds_a_valid_prompt(self, mock_post):
        mock_post.return_value = Mock(status_code=200, json=lambda: {
            "candidates": [{"content": {"parts": [{"text": "Looks fine so far."}]}}]
        })
        result = generate_diary_analysis(self.entry, [])  # empty history list
        self.assertEqual(result, "Looks fine so far.")
        mock_post.assert_called_once()
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python manage.py test crops.tests.DiaryAiTests -v 2`
Expected: FAIL (`crops.diary_ai` doesn't exist)

- [ ] **Step 3: Add `GEMINI_API_KEY` to `backend/config/settings.py`**

Directly below the existing `YOUTUBE_API_KEY` block, same comment style:
```python
# ---------------------------------------------------------------------------
# Farming Diary AI analysis -- Google Gemini (free tier). Server-side only,
# same blank-key-fails-soft pattern as OPENWEATHER_API_KEY/YOUTUBE_API_KEY.
# ---------------------------------------------------------------------------
GEMINI_API_KEY = env('GEMINI_API_KEY', default='')
```

- [ ] **Step 4: Implement `crops/diary_ai.py`**

```python
GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent"
REQUEST_TIMEOUT_SECONDS = 5
MAX_HISTORY_ENTRIES = 5

def generate_diary_analysis(entry, recent_entries):
    ...
```

Build the prompt from: `entry.tracker.crop.name`, `entry.tracker.current_stage.name` (guard for
`None`), which `did_*` booleans are `True` plus `other_activity_note`, `entry.note`,
`entry.photo_diagnosis_label`/`confidence` (guard for blank), and up to `MAX_HISTORY_ENTRIES` from
`recent_entries` (each contributing its own `note` + `ai_analysis`, oldest to newest — the caller is
responsible for passing them in that order and already limited to 5; this function does not
re-query the DB itself, keeping it a pure, easily-mocked function per the spec). POST to
`GEMINI_URL` with `?key={settings.GEMINI_API_KEY}`, a short system-style instruction (practical
agricultural advisor, 2-4 sentences, flag concerns, suggest a concrete next step, never invent a
diagnosis the CNN didn't report, say plainly if nothing stands out), `timeout=REQUEST_TIMEOUT_SECONDS`.
On `requests.RequestException` (covers `Timeout`), non-200 status, or a response whose JSON doesn't
contain the expected `candidates[0].content.parts[0].text` shape (`KeyError`/`IndexError`/`TypeError`
all caught) — return `None`. Otherwise return that text.

- [ ] **Step 5: Wire the call into the view**

In `FarmingDiaryEntryListCreateView`'s `perform_create` (and the equivalent path for the
same-day-update case from Task 2 Step 3), after the entry is saved (and after Task 3's photo
diagnosis has run, since the prompt needs `photo_diagnosis_label`), fetch
`list(entry.tracker.diary_entries.exclude(pk=entry.pk)[:5])` as `recent_entries`, call
`generate_diary_analysis(entry, recent_entries)`, and save `ai_analysis`/`ai_analysis_status` onto
the entry from the result (`None` → `UNAVAILABLE`/blank; a string → `OK`/that string).

- [ ] **Step 6: Run tests to verify they pass**

Run: `python manage.py test crops.tests.DiaryAiTests -v 2`
Expected: PASS (all 5 tests)
Run: `python manage.py test crops` (full app regression)
Expected: all passing

- [ ] **Step 7: Commit**

```bash
git add backend/crops/diary_ai.py backend/config/settings.py backend/crops/serializers.py backend/crops/views.py backend/crops/tests.py
git commit -m "feat: add Gemini-backed AI analysis for Farming Diary entries"
```

---

### Task 5: Frontend API helper — `api/diary.js`

**Files:**
- Create: `frontend/src/api/diary.js`
- Test: `frontend/src/api/diary.test.js`

**Interfaces:**
- Consumes: `api` (axios instance, `frontend/src/api/axios.js` — same import every other `api/*.js`
  file uses).
- Produces: `fetchDiaryEntries(trackerId)` → `GET crops/diary/?tracker=<trackerId>`, returns the
  array. `saveDiaryEntry(trackerId, fields)` where `fields` is `{didIrrigation, didFertilizer,
  didSpraying, didPruning, otherActivityNote, note, photoFile}` → builds a `FormData` (required
  whenever `photoFile` is present; use `FormData` unconditionally for simplicity) with the
  snake_case field names the backend expects (`tracker`, `did_irrigation`, `did_fertilizer`,
  `did_spraying`, `did_pruning`, `other_activity_note`, `note`, `photo`), `POST`s to `crops/diary/`,
  returns the saved entry. Later tasks (6, 7) import both functions by these exact names.

- [ ] **Step 1: Write the failing tests**

```javascript
describe("diary API helpers", () => {
  it("fetchDiaryEntries fetches entries for a tracker", async () => {
    api.get.mockResolvedValue({ data: [{ id: 1, note: "x" }] });
    const result = await fetchDiaryEntries(5);
    expect(api.get).toHaveBeenCalledWith("crops/diary/?tracker=5");
    expect(result).toEqual([{ id: 1, note: "x" }]);
  });

  it("saveDiaryEntry posts a FormData payload with snake_case fields", async () => {
    api.post.mockResolvedValue({ data: { id: 2 } });
    await saveDiaryEntry(5, { didIrrigation: true, note: "watered", photoFile: null });
    const [url, formData] = api.post.mock.calls[0];
    expect(url).toBe("crops/diary/");
    expect(formData.get("tracker")).toBe("5");
    expect(formData.get("did_irrigation")).toBe("true");
    expect(formData.get("note")).toBe("watered");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/api/diary.test.js`
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `frontend/src/api/diary.js`**

Follow `api/cropTracker.js`'s exact style (same header-comment convention explaining why this is a
separate file, same thin-wrapper shape).

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/api/diary.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/diary.js frontend/src/api/diary.test.js
git commit -m "feat: add diary API helper"
```

---

### Task 6: Daily Log form (activities, note, photo) on `CropDetailPage.jsx`

**Files:**
- Modify: `frontend/src/pages/CropDetailPage.jsx`
- Modify: `frontend/src/i18n/locales/en.json`, `kn.json`, `hi.json` (new `crops.diary.*` keys for
  this task's UI only — labels, buttons, the empty-entry error message; Task 7 adds the rest)
- Test: `frontend/src/pages/CropDetailPage.test.jsx` (new `describe("Daily Log")` block)

**Interfaces:**
- Consumes: `fetchDiaryEntries`, `saveDiaryEntry` (Task 5); renders only when `tracker` (the
  existing state) is non-null — the diary is a property of an active tracker, same gating logic
  already used for the tracker-form section.
- Produces: new local state (`diaryEntries`, `diaryForm`, `diarySubmitting`, `diaryError`) read by
  Task 7's timeline rendering.

- [ ] **Step 1: Write the failing tests**

```javascript
describe("Daily Log", () => {
  it("shows the Daily Log form once a tracker exists, pre-filled from today's entry if one exists", async () => {
    // mock fetchTrackers to return an existing tracker, fetchDiaryEntries to return
    // [{ entry_date: todayISO, did_irrigation: true, note: "watered" }]
    // assert the irrigation checkbox is checked and the note textarea shows "watered"
  });

  it("submits the form and clears/updates it with the saved entry", async () => {
    // fill checkboxes + note, submit, assert saveDiaryEntry called with expected fields
  });

  it("shows a validation error from the backend instead of a generic message", async () => {
    // saveDiaryEntry rejects with { response: { data: { note: ["Too long."] } } }
    // assert "Too long." is shown
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/pages/CropDetailPage.test.jsx -t "Daily Log"`
Expected: FAIL (no Daily Log section rendered yet)

- [ ] **Step 3: Implement the form in `CropDetailPage.jsx`**

New section placed directly after the existing tracker section (inside the same `{tracker && (...)}`
conditional, or its own `{tracker && (...)}` block immediately following it — implementer's choice,
keep it visually and structurally separate from the tracker-start/update form). On mount (once
`tracker` is set), call `fetchDiaryEntries(tracker.id)`; if today's entry is in the result, pre-fill
the form state from it (same pre-fill-on-reopen pattern the existing tracker form already uses via
`openTrackerForm`). Four checkboxes (irrigation/fertilizer/spraying/pruning), an "other" text input
(only meaningfully enabled/shown when its own checkbox-equivalent is relevant — implementer's call
on exact UX, the spec doesn't pin this down beyond "an other checkbox with its own short text
field"), the free-text `<textarea>`, a `<input type="file" accept="image/jpeg,image/png">` for the
photo. On submit: call `saveDiaryEntry`, on success replace the relevant entry in `diaryEntries`
(Task 7 renders this list) and re-run the pre-fill, on failure surface the backend's field-level
error the same way `handleTrackerSubmit`'s catch block already does (`err.response?.data`, first
field's message).

- [ ] **Step 4: Add the new i18n keys** to `en.json`/`kn.json`/`hi.json` under `crops.diary.*`:
  `sectionTitle`, `irrigationLabel`, `fertilizerLabel`, `sprayingLabel`, `pruningLabel`,
  `otherLabel`, `otherNotePlaceholder`, `notePlaceholder`, `photoLabel`, `submitButton`,
  `saveError`. Real Kannada and Hindi translations, not placeholders — matching the existing
  `crops.tracker.*` keys' translation quality in those same two files.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/pages/CropDetailPage.test.jsx -t "Daily Log"`
Expected: PASS (all 3 tests)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/CropDetailPage.jsx frontend/src/i18n/locales/ frontend/src/pages/CropDetailPage.test.jsx
git commit -m "feat: add Daily Log form to the crop detail page"
```

---

### Task 7: Diary timeline + AI response display

**Files:**
- Modify: `frontend/src/pages/CropDetailPage.jsx`
- Modify: `frontend/src/i18n/locales/en.json`, `kn.json`, `hi.json` (remaining `crops.diary.*` keys
  for the timeline/AI-response UI)
- Test: `frontend/src/pages/CropDetailPage.test.jsx`

**Interfaces:**
- Consumes: `diaryEntries` state (Task 6).
- Produces: nothing new consumed by later tasks — this is the plan's last task.

- [ ] **Step 1: Write the failing tests**

```javascript
describe("Daily Log timeline", () => {
  it("renders past entries most-recent-first with their AI analysis", async () => {
    // diaryEntries = [{ entry_date: "2026-10-19", note: "a", ai_analysis: "Looks healthy.", ai_analysis_status: "ok" }, ...older]
    // assert order and that "Looks healthy." is shown
  });

  it("shows a graceful fallback message when ai_analysis_status is unavailable", async () => {
    // one entry with ai_analysis_status: "unavailable"
    // assert the fallback message is shown, not an empty space or an error
  });

  it("shows the photo diagnosis label when a photo was analyzed", async () => {
    // entry with photo_diagnosis_label set
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/pages/CropDetailPage.test.jsx -t "Daily Log timeline"`
Expected: FAIL (no timeline rendered yet)

- [ ] **Step 3: Implement the timeline in `CropDetailPage.jsx`**

Below Task 6's form, map `diaryEntries` (already ordered most-recent-first by the backend's `Meta.ordering`
— no client-side re-sort needed) to a list of cards, each showing: the date, which activities were
logged, the note, the photo thumbnail + diagnosis label if present, and either `ai_analysis` (when
`ai_analysis_status === "ok"`) or the fallback message (when `"unavailable"`).

- [ ] **Step 4: Add the remaining i18n keys** under `crops.diary.*`: `timelineTitle`,
  `analysisUnavailable`, `photoDiagnosisPrefix`, `noEntriesYet` (shown when `diaryEntries` is
  empty). Real Kannada/Hindi translations.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/pages/CropDetailPage.test.jsx`
Expected: PASS (full file, including Task 6's tests)
Run: `npm run build`
Expected: clean build

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/CropDetailPage.jsx frontend/src/i18n/locales/ frontend/src/pages/CropDetailPage.test.jsx
git commit -m "feat: add Daily Log timeline with AI analysis display"
```
