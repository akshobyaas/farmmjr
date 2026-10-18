# Crop Lifecycle Tracker, Risk Alerts & Task Reminders — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Crop Lifecycle Tracker foundation, proactive weather+growth-stage disease-risk
alerts, and crop-stage task reminders described in `USP_FEATURES_DESIGN.md` — the project's answer
to the guide's "what's novel here" requirement.

**Architecture:** Three phases, each a working, independently demoable deliverable: (A) a tracker a
farmer attaches to a crop they're growing, with a derived-or-confirmed current stage; (B) a dashboard
risk alert that cross-checks a weather forecast against that stage; (C) a dashboard task list for
that same stage. B and C both depend on A but not on each other, and can be built/verified/shipped in
either order once A exists — this plan does B before C to match the earlier design-review order.

**Tech Stack:** Django 6.1 / DRF 3.18.0 (backend), React + Vite + react-i18next (frontend), Vitest +
React Testing Library (frontend tests), Django `TestCase`/DRF `APITestCase` (backend tests), the
existing OpenWeatherMap proxy pattern, Django's `cache` framework (already used by `locator`/`videos`).

**Spec:** `USP_FEATURES_DESIGN.md` (repo root, committed as device commit `08495c2`) — read it
alongside this plan; this plan does not repeat its rationale, only the decisions needed to build it.

## Global Constraints

- Every new per-user resource is ownership-scoped exactly like `AdvisoryQuery`/`AdvisoryQueryCreateSerializer`: `farmer`/owner comes from `request.user` server-side, never trusted from the client body (mass-assignment protection, the pattern used throughout this codebase).
- Every new external-dependent view (forecast calls) degrades gracefully — plain-language `detail` message + an appropriate 4xx/503, never a raw 500 — matching `weather/views.py`'s existing error handling exactly.
- Detailed farmer-facing *content* (risk-rule advisory text, task instructions) stays English-only for v1, per this project's existing documented convention (see `Crop` model's own comment); UI chrome strings go through the existing i18n system (en/kn/hi).
- No background scheduler exists (no Celery/cron) — "proactive" means checking a forecast on demand, never polling/storing history.
- One active tracker per (farmer, crop) — enforced at the model level (`unique_together`), per the approved design decision.
- Cache external-API-backed results briefly, same pattern as `locator`/`videos` (`django.core.cache`, a short TTL, a cache key derived from the varying input).
- Every `DiseaseRiskRule` and `CropTask` row's `source_citation` field must be genuinely populated — empty/placeholder citations fail that task's own test.
- Follow this project's standing device-push working style for every phase's final task: cloud-mirror test first, live Playwright check against real dev servers, `device_commit_files` + independent sha256 verification (twice, a few seconds apart), commit on the device, then update `PROJECT_STATUS.md`/`NEXT_STEPS.md`.

## Review Focus

- No active tracker exists yet when `/crops/risk-alerts/` or `/crops/tasks/today/` is called (a brand-new farmer) — must return an empty/explicit "nothing tracked yet" response, not an error. (Task B4, C3)
- A tracker exists but the farmer never set `home_location` — the risk-alerts endpoint must say so plainly rather than crash on a missing location. (Task B4)
- The OpenWeatherMap forecast call times out, errors, or returns a non-200 — must degrade exactly like the existing current-weather proxy (503, plain message), not raise. (Task B3, B4)
- A farmer tries to create a second active tracker for a crop they already track — must surface a clean validation error (400 with a readable message), not an unhandled `IntegrityError`. (Task A5)
- A perennial crop's typical-month range wraps across year end (e.g. a harvest season spanning November–February) — the "is current month in this stage's range" check must handle wraparound correctly, not just `start <= month <= end`, which silently breaks for a wrapped range. (Task A2, A4)

---

## Phase A — Crop Lifecycle Tracker Foundation

### Task A1: `CropStage` model

**Files:**
- Modify: `backend/crops/models.py` (add `CropStage`)
- Modify: `backend/crops/admin.py` (register it)
- Create: `backend/crops/migrations/0003_cropstage.py` (via `makemigrations`)
- Test: `backend/crops/tests.py` (add `CropStageModelTests`)

**Interfaces:**
- Produces: `CropStage` model with fields `crop` (FK to `Crop`), `name` (CharField), `day_range_start`/`day_range_end` (nullable PositiveIntegerField), `typical_month_start`/`typical_month_end` (nullable PositiveSmallIntegerField, 1-12), `order` (PositiveIntegerField). `Meta.ordering = ["crop__name", "order"]`.

- [ ] **Step 1: Write the failing test**

```python
class CropStageModelTests(TestCase):
    def test_ordering_is_by_crop_then_order(self):
        rice = Crop.objects.create(name="Rice")
        CropStage.objects.create(crop=rice, name="Harvest", order=2)
        CropStage.objects.create(crop=rice, name="Germination", order=1)
        names = list(CropStage.objects.filter(crop=rice).values_list("name", flat=True))
        self.assertEqual(names, ["Germination", "Harvest"])

    def test_day_range_and_month_range_fields_are_optional(self):
        rice = Crop.objects.create(name="Rice")
        stage = CropStage.objects.create(crop=rice, name="Flowering", day_range_start=45, day_range_end=65, order=1)
        self.assertEqual((stage.day_range_start, stage.day_range_end), (45, 65))
        self.assertIsNone(stage.typical_month_start)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python manage.py test crops.tests.CropStageModelTests -v 2`
Expected: FAIL — `CropStage` not defined / no such table.

- [ ] **Step 3: Implement `CropStage` in `backend/crops/models.py`**

Add the model exactly as specified in Interfaces above, directly below the existing `Lifecycle`
model (keep `Lifecycle` untouched — it still serves the Crop Detail page's "life story" content).
Register in `admin.py` with `list_display = ("crop", "name", "order")`, matching the existing
registration style for `Lifecycle`/`FertilizerSchedule` in that file.

- [ ] **Step 4: Generate and apply the migration**

Run: `python manage.py makemigrations crops` then `python manage.py migrate`
Expected: a new `0003_cropstage` migration file is created and applies cleanly.

- [ ] **Step 5: Run test to verify it passes**

Run: `python manage.py test crops.tests.CropStageModelTests -v 2`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/crops/models.py backend/crops/admin.py backend/crops/migrations/0003_cropstage.py backend/crops/tests.py
git commit -m "feat: add CropStage model for farmer-trackable crop stages"
```

---

### Task A2: Research & seed real `CropStage` content for all 4 crops

**Files:**
- Modify: `backend/crops/management/commands/seed_demo_data.py` (add stage-seeding, reusing the existing per-crop loop)
- Test: `backend/crops/tests.py` (add `CropStageSeedContentTests`)

**Interfaces:**
- Consumes: `CropStage` (Task A1).
- Produces: every seeded `Crop` has a complete, ordered set of `CropStage` rows. Rice's stages use `day_range_start`/`day_range_end` copied from its existing `Lifecycle` day values (Germination 5-10, Vegetative 20-45, Flowering 45-65, Harvest 100-140 — confirmed in `USP_FEATURES_DESIGN.md` section 1). Arecanut/Black Pepper/Cocoa's stages use `typical_month_start`/`typical_month_end` for a real recurring annual cycle (Vegetative flush / Flowering / Fruit development / Harvest), researched from ICAR-CPCRI Kasaragod, Karnataka university extension material, and the other sources listed in the design doc's section 5 — not invented. Each row's reasoning (which months, from which source) must be captured as a code comment next to the seed data, in the same style `seed_demo_data.py` already uses for its disease/treatment content.

- [ ] **Step 1: Write the failing test**

```python
class CropStageSeedContentTests(TestCase):
    def setUp(self):
        call_command("seed_demo_data")

    def test_every_crop_has_ordered_stages_covering_the_year_or_a_full_cycle(self):
        for crop in Crop.objects.all():
            stages = list(CropStage.objects.filter(crop=crop).order_by("order"))
            self.assertGreater(len(stages), 0, f"{crop.name} has no CropStage rows")
            self.assertEqual([s.order for s in stages], sorted(s.order for s in stages))

    def test_rice_stages_are_day_based_and_match_existing_lifecycle_values(self):
        rice = Crop.objects.get(name="Rice")
        flowering = CropStage.objects.get(crop=rice, name__icontains="Flowering")
        self.assertEqual((flowering.day_range_start, flowering.day_range_end), (45, 65))

    def test_perennial_crop_stages_are_month_based_not_day_based(self):
        arecanut = Crop.objects.get(name="Arecanut")
        for stage in CropStage.objects.filter(crop=arecanut):
            self.assertIsNone(stage.day_range_start)
            self.assertIsNotNone(stage.typical_month_start)
            self.assertIsNotNone(stage.typical_month_end)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python manage.py test crops.tests.CropStageSeedContentTests -v 2`
Expected: FAIL — no `CropStage` rows exist yet.

- [ ] **Step 3: Research and implement the seed content**

Research each perennial crop's actual annual phenological calendar for the Dakshina
Kannada/Shivamogga/Udupi belt specifically (ICAR-CPCRI Kasaragod publications first, then Karnataka
extension material, Campco, Dept. of Horticulture, regional agri-journalism — cross-check at least
two sources per crop before writing a month range). For each crop add a `_seed_crop_stages(crop,
stage_defs)` helper call inside the existing per-crop loop in `seed_demo_data.py`'s `handle()`,
where `stage_defs` is a list of `(name, day_start, day_end, month_start, month_end, order)` tuples
(use `None` for whichever pair doesn't apply to that crop). Add a one-line comment above each
perennial crop's `stage_defs` naming the source the month range came from. Rice reuses its own
already-seeded `Lifecycle` day values verbatim.

- [ ] **Step 4: Run test to verify it passes**

Run: `python manage.py test crops.tests.CropStageSeedContentTests -v 2`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/crops/management/commands/seed_demo_data.py backend/crops/tests.py
git commit -m "feat: seed researched CropStage content for all 4 crops"
```

---

### Task A3: `Profile.home_location` field

**Files:**
- Modify: `backend/accounts/models.py` (add `home_location` to `User`)
- Modify: `backend/accounts/serializers.py` (add to `ProfileSerializer.Meta.fields`, writable)
- Create: `backend/accounts/migrations/000N_user_home_location.py`
- Test: `backend/accounts/tests.py` (add 2 cases to the existing profile test class)

**Interfaces:**
- Produces: `User.home_location` (`CharField(max_length=200, blank=True)`); `ProfileSerializer` now accepts `home_location` as a writable field (added to `fields`, NOT to `read_only_fields`).

- [ ] **Step 1: Write the failing test**

```python
def test_farmer_can_set_their_own_home_location(self):
    self.client.force_authenticate(self.farmer)
    response = self.client.patch(f"/auth/profile/{self.farmer.id}/", {"home_location": "Puttur"})
    self.assertEqual(response.status_code, status.HTTP_200_OK)
    self.farmer.refresh_from_db()
    self.assertEqual(self.farmer.home_location, "Puttur")

def test_home_location_defaults_to_blank(self):
    self.assertEqual(self.farmer.home_location, "")
```

(Add both to whatever existing `TestCase` class in `backend/accounts/tests.py` already exercises
`PATCH /auth/profile/<id>/` — follow its existing `setUp` fixture rather than duplicating one.)

- [ ] **Step 2: Run test to verify it fails**

Run: `python manage.py test accounts.tests -v 2 -k home_location`
Expected: FAIL — `home_location` not a model field.

- [ ] **Step 3: Implement the field**

Add `home_location = models.CharField(max_length=200, blank=True)` to `User` in
`backend/accounts/models.py`, directly below `phone_number`. Add `"home_location"` to
`ProfileSerializer.Meta.fields` in `backend/accounts/serializers.py` — do **not** add it to
`read_only_fields`, since it must stay writable (this is the one deliberate exception; every other
new field in this plan follows the opposite, read-only-unless-explicitly-owned-by-the-farmer
pattern already used for `AdvisoryQuery.farmer`).

- [ ] **Step 4: Generate and apply the migration**

Run: `python manage.py makemigrations accounts` then `python manage.py migrate`

- [ ] **Step 5: Run test to verify it passes**

Run: `python manage.py test accounts.tests -v 2 -k home_location`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/accounts/models.py backend/accounts/serializers.py backend/accounts/migrations/ backend/accounts/tests.py
git commit -m "feat: add farmer home_location profile field"
```

---

### Task A4: `FarmerCropTracker` model + stage-derivation helper

**Files:**
- Modify: `backend/crops/models.py` (add `FarmerCropTracker`)
- Modify: `backend/crops/admin.py` (register it)
- Create: `backend/crops/stage_derivation.py` (new file — the derivation helper, kept separate from `models.py` since it's logic, not schema)
- Create: `backend/crops/migrations/0004_farmercroptracker.py`
- Test: `backend/crops/tests.py` (add `FarmerCropTrackerModelTests`, `StageDerivationTests`)

**Interfaces:**
- Consumes: `CropStage` (Task A1/A2).
- Produces: `FarmerCropTracker` model — `farmer` (FK to `settings.AUTH_USER_MODEL`), `crop` (FK to `Crop`), `planting_date` (nullable DateField), `current_stage` (nullable FK to `CropStage`, `on_delete=models.SET_NULL`), `stage_confirmed_at` (`auto_now=True` DateField), `is_active` (BooleanField, default `True`); `Meta.unique_together = ("farmer", "crop")`. `derive_stage_for_tracker(tracker: FarmerCropTracker) -> CropStage | None` in `stage_derivation.py`: for a crop whose stages are day-based (any `CropStage` row has `day_range_start` set), compute days since `tracker.planting_date` and return the matching stage (or the last stage if days exceed every range, or `None` if `planting_date` is unset); for a crop whose stages are month-based, return the stage whose `typical_month_start`..`typical_month_end` range contains today's month, **handling wraparound** (e.g. `start=11, end=2` must match months 11, 12, 1, 2) with `(month - start) % 12 <= (end - start) % 12`.

- [ ] **Step 1: Write the failing test**

```python
class StageDerivationTests(TestCase):
    def setUp(self):
        self.rice = Crop.objects.create(name="Rice")
        self.germ = CropStage.objects.create(crop=self.rice, name="Germination", day_range_start=0, day_range_end=10, order=1)
        self.flower = CropStage.objects.create(crop=self.rice, name="Flowering", day_range_start=45, day_range_end=65, order=2)
        self.arecanut = Crop.objects.create(name="Arecanut")
        self.flowering_season = CropStage.objects.create(crop=self.arecanut, name="Flowering", typical_month_start=3, typical_month_end=5, order=1)
        self.harvest_season = CropStage.objects.create(crop=self.arecanut, name="Harvest", typical_month_start=11, typical_month_end=2, order=2)

    def test_day_based_stage_derives_from_planting_date(self):
        farmer = User.objects.create_user(username="f1", password="x")
        tracker = FarmerCropTracker.objects.create(
            farmer=farmer, crop=self.rice, planting_date=date.today() - timedelta(days=50)
        )
        self.assertEqual(derive_stage_for_tracker(tracker), self.flower)

    def test_day_based_stage_is_none_without_planting_date(self):
        farmer = User.objects.create_user(username="f2", password="x")
        tracker = FarmerCropTracker.objects.create(farmer=farmer, crop=self.rice, planting_date=None)
        self.assertIsNone(derive_stage_for_tracker(tracker))

    def test_month_based_stage_handles_year_wraparound(self):
        farmer = User.objects.create_user(username="f3", password="x")
        tracker = FarmerCropTracker.objects.create(farmer=farmer, crop=self.arecanut)
        with patch("crops.stage_derivation.date") as mock_date:
            mock_date.today.return_value = date(2026, 12, 15)
            self.assertEqual(derive_stage_for_tracker(tracker), self.harvest_season)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python manage.py test crops.tests.StageDerivationTests -v 2`
Expected: FAIL — `FarmerCropTracker`/`derive_stage_for_tracker` not defined.

- [ ] **Step 3: Implement `FarmerCropTracker` and `derive_stage_for_tracker`**

Add the model to `backend/crops/models.py` as specified above. Create
`backend/crops/stage_derivation.py` with `derive_stage_for_tracker` as specified — the wraparound
check is the one piece of real logic here; everything else is a straightforward range/lookup.

- [ ] **Step 4: Generate and apply the migration**

Run: `python manage.py makemigrations crops` then `python manage.py migrate`

- [ ] **Step 5: Run test to verify it passes**

Run: `python manage.py test crops.tests.StageDerivationTests crops.tests.FarmerCropTrackerModelTests -v 2`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/crops/models.py backend/crops/admin.py backend/crops/stage_derivation.py backend/crops/migrations/0004_farmercroptracker.py backend/crops/tests.py
git commit -m "feat: add FarmerCropTracker model and stage-derivation helper"
```

---

### Task A5: `FarmerCropTracker` endpoint (list/create/update, ownership-scoped)

**Files:**
- Modify: `backend/crops/serializers.py` (add `FarmerCropTrackerSerializer`)
- Modify: `backend/crops/views.py` (add `FarmerCropTrackerListCreateView`, `FarmerCropTrackerDetailView`)
- Modify: `backend/crops/urls.py` (add routes)
- Test: `backend/crops/tests.py` (add `FarmerCropTrackerAPITests`)

**Interfaces:**
- Consumes: `FarmerCropTracker`, `derive_stage_for_tracker` (Task A4).
- Produces: `GET/POST /crops/trackers/` (list the requesting farmer's own trackers; create one — `farmer` set server-side from `request.user`, never from the body, same pattern as `AdvisoryQueryCreateSerializer`). `PATCH /crops/trackers/<id>/` (update `planting_date` or `current_stage` on the farmer's own tracker only). On create or on a `planting_date`/stage-relevant update, if the farmer did not explicitly send `current_stage`, the view calls `derive_stage_for_tracker` and sets it as a suggestion.

- [ ] **Step 1: Write the failing test**

```python
class FarmerCropTrackerAPITests(APITestCase):
    def setUp(self):
        self.rice = Crop.objects.create(name="Rice")
        CropStage.objects.create(crop=self.rice, name="Germination", day_range_start=0, day_range_end=10, order=1)
        CropStage.objects.create(crop=self.rice, name="Flowering", day_range_start=45, day_range_end=65, order=2)
        self.farmer = User.objects.create_user(username="farmer1", password="x")
        self.other_farmer = User.objects.create_user(username="farmer2", password="x")

    def test_creating_a_tracker_sets_farmer_from_request_not_body(self):
        self.client.force_authenticate(self.farmer)
        response = self.client.post("/crops/trackers/", {
            "crop": self.rice.id, "planting_date": str(date.today() - timedelta(days=50)),
            "farmer": self.other_farmer.id,  # attempted spoof
        })
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        tracker = FarmerCropTracker.objects.get(id=response.data["id"])
        self.assertEqual(tracker.farmer, self.farmer)

    def test_creating_a_tracker_auto_derives_stage(self):
        self.client.force_authenticate(self.farmer)
        response = self.client.post("/crops/trackers/", {
            "crop": self.rice.id, "planting_date": str(date.today() - timedelta(days=50)),
        })
        self.assertEqual(response.data["current_stage"]["name"], "Flowering")

    def test_farmer_only_sees_their_own_trackers(self):
        FarmerCropTracker.objects.create(farmer=self.other_farmer, crop=self.rice)
        self.client.force_authenticate(self.farmer)
        response = self.client.get("/crops/trackers/")
        self.assertEqual(len(response.data), 0)

    def test_second_tracker_for_same_crop_is_a_clean_400_not_a_500(self):
        self.client.force_authenticate(self.farmer)
        self.client.post("/crops/trackers/", {"crop": self.rice.id})
        response = self.client.post("/crops/trackers/", {"crop": self.rice.id})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python manage.py test crops.tests.FarmerCropTrackerAPITests -v 2`
Expected: FAIL — 404s, no such URL.

- [ ] **Step 3: Implement the serializer, views, and URLs**

`FarmerCropTrackerSerializer`: `fields = ["id", "crop", "planting_date", "current_stage", "stage_confirmed_at", "is_active"]`, `read_only_fields = ["id", "stage_confirmed_at"]`; nest `current_stage` read as `{"id", "name"}` via a small `SerializerMethodField` or a short nested serializer (farmer never writes `current_stage` directly as a bare FK id in the common case — the view derives it — but allow an explicit override value to pass through `validated_data` when sent). In the view's `perform_create`/`perform_update`, call `derive_stage_for_tracker` and set `current_stage` whenever the farmer didn't explicitly include `current_stage` in the request body. Validate the `unique_together` constraint explicitly in `validate()` (query `FarmerCropTracker.objects.filter(farmer=request.user, crop=...)`) and raise `serializers.ValidationError` with a readable message, rather than letting the DB `IntegrityError` surface as a 500. Add both URL patterns to `crops/urls.py`.

- [ ] **Step 4: Run test to verify it passes**

Run: `python manage.py test crops.tests.FarmerCropTrackerAPITests -v 2`
Expected: PASS

- [ ] **Step 5: Run the full backend suite to confirm no regressions**

Run: `python manage.py test`
Expected: all pre-existing tests plus the new ones pass.

- [ ] **Step 6: Commit**

```bash
git add backend/crops/serializers.py backend/crops/views.py backend/crops/urls.py backend/crops/tests.py
git commit -m "feat: add ownership-scoped FarmerCropTracker API"
```

---

### Task A6: Frontend API module + "Track this crop" UI on CropDetailPage

**Files:**
- Create: `frontend/src/api/cropTracker.js`
- Modify: `frontend/src/pages/CropDetailPage.jsx`
- Modify: `frontend/src/i18n/locales/{en,kn,hi}.json` (new `crops.tracker.*` keys)
- Test: `frontend/src/pages/CropDetailPage.test.jsx`

**Interfaces:**
- Consumes: `GET/POST/PATCH /crops/trackers/` (Task A5).
- Produces: `fetchTrackers()`, `createTracker({cropId, plantingDate})`, `updateTracker(id, fields)` exported from `api/cropTracker.js`, following the exact call shape of `api/advisory.js`'s functions. A new `<section className="crop-section">` on `CropDetailPage.jsx`, placed after the existing soil/climate/planting-method `status-card` and before the intercropped-with section, offering "Track this crop" when no active tracker exists for it, or showing the current (derived-or-confirmed) stage with an "update" control when one does.

- [ ] **Step 1: Write the failing test**

```jsx
it("lets a farmer start tracking this crop and shows the derived stage", async () => {
  vi.mocked(fetchCropDetail).mockResolvedValue(mockRiceCrop);
  vi.mocked(fetchTrackers).mockResolvedValue([]);
  vi.mocked(createTracker).mockResolvedValue({ id: 1, crop: 1, current_stage: { id: 2, name: "Flowering" } });
  render(<CropDetailPage />, { route: "/crops/1" });
  await userEvent.click(await screen.findByRole("button", { name: /track this crop/i }));
  // ... fill planting date, submit ...
  expect(await screen.findByText(/Flowering/i)).toBeInTheDocument();
});
```

(Follow this file's existing test setup exactly — its router/mock conventions are already
established; write the real assertions against the actual rendered markup once the component
exists, matching the style of this page's other existing tests.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pages/CropDetailPage.test.jsx`
Expected: FAIL — tracker UI doesn't exist yet.

- [ ] **Step 3: Add `trackable_stages` to `CropDetailSerializer` (small backend addition)**

Add a nested `CropStageSerializer` (`fields = ["id", "name", "day_range_start", "day_range_end", "typical_month_start", "typical_month_end", "order"]`) to `backend/crops/serializers.py`, and add `trackable_stages = CropStageSerializer(many=True, read_only=True)` to `CropDetailSerializer.Meta.fields` (source: `CropStage`'s existing `related_name` — add `related_name="trackable_stages"` to `CropStage.crop`'s `ForeignKey` in Task A1 if not already set there; if it is, this is a pure serializer addition). This is the one place `CropDetailSerializer` changes in this phase — no new view or URL needed, since `GET /crops/<id>/` already exists. Add one backend test confirming `trackable_stages` appears in the detail response.

- [ ] **Step 4: Implement `api/cropTracker.js` and the CropDetailPage UI**

`api/cropTracker.js` exports three functions exactly as specified in Interfaces, each a thin
wrapper over `api.get`/`api.post`/`api.patch` against `crops/trackers/`, matching `api/advisory.js`'s
style precisely. In `CropDetailPage.jsx`, add local state for the farmer's tracker on this crop
(fetched alongside the crop detail via `fetchTrackers()` and matched by `crop.id`), and a form built
from `crop.trackable_stages` (now present on the already-fetched crop detail object): a planting-date
`<input type="date">` when any stage has `day_range_start` set, otherwise a `<select>` listing
`crop.trackable_stages`' names.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/pages/CropDetailPage.test.jsx`
Expected: PASS

- [ ] **Step 6: Add i18n keys and run the full frontend suite**

Add `crops.tracker.trackButton`, `crops.tracker.plantingDateLabel`, `crops.tracker.stageLabel`,
`crops.tracker.currentStagePrefix` (and any others the implementation needs) to all three locale
files, fully translated — verify with the project's existing key-set diff habit (same key set across
en/kn/hi).
Run: `npm test` — Expected: all pass. Run: `npm run build` — Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/api/cropTracker.js frontend/src/pages/CropDetailPage.jsx frontend/src/pages/CropDetailPage.test.jsx frontend/src/i18n/locales/
git commit -m "feat: add Track This Crop UI to Crop Detail page"
```

---

### Task A7: Frontend Profile "home location" field

**Files:**
- Modify: `frontend/src/pages/ProfilePage.jsx`
- Modify: `frontend/src/i18n/locales/{en,kn,hi}.json` (new `profile.homeLocation*` keys)
- Test: `frontend/src/pages/ProfilePage.test.jsx`

**Interfaces:**
- Consumes: `updateProfile` from `AuthContext` (already exists; `home_location` is simply one more field in the object it's called with — no `AuthContext` change needed).
- Produces: one new text input on the Profile form, saved the same way every other profile field already is.

- [ ] **Step 1: Write the failing test**

```jsx
it("lets a farmer save their home location", async () => {
  render(<ProfilePage />);
  await userEvent.type(screen.getByLabelText(/location/i), "Puttur");
  await userEvent.click(screen.getByRole("button", { name: /save/i }));
  expect(updateProfile).toHaveBeenCalledWith(expect.objectContaining({ home_location: "Puttur" }));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pages/ProfilePage.test.jsx`
Expected: FAIL — no location field in the form.

- [ ] **Step 3: Implement the field**

Add a labeled text `<input>` for `home_location` to the existing profile form, following this
page's existing field pattern exactly (same state/`onChange`/submit wiring as `phone_number`).

- [ ] **Step 4: Run test to verify it passes, then the full frontend suite**

Run: `npx vitest run src/pages/ProfilePage.test.jsx` then `npm test` — Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/ProfilePage.jsx frontend/src/pages/ProfilePage.test.jsx frontend/src/i18n/locales/
git commit -m "feat: add home location field to Profile page"
```

---

### Task A8: Phase A verification & device push

**Files:** none new — this task verifies and ships everything from A1-A7.

- [ ] **Step 1:** Run the full backend suite (`python manage.py test`) and full frontend suite (`npm test && npm run build`) in the cloud mirror — expect 100% pass, no regressions in pre-existing counts.
- [ ] **Step 2:** Live-verify with Playwright against real dev servers: log in as a farmer, open a Rice crop's detail page, start tracking it with a planting date, confirm the derived stage shows; open an Arecanut crop's detail page, confirm a sensible default seasonal stage is suggested and can be overridden; set a home location on the Profile page and confirm it persists across reload.
- [ ] **Step 3:** Push every changed/new file to the device via `device_commit_files`; independently sha256-verify immediately and again ~5 seconds later before trusting it.
- [ ] **Step 4:** Commit on the device.
- [ ] **Step 5:** Update `PROJECT_STATUS.md` and `NEXT_STEPS.md` (via `Projects.project_write`) describing Phase A as complete, with the real commit hash and test counts.

---

## Phase B — Proactive Disease-Risk Alerts

### Task B1: `DiseaseRiskRule` model

**Files:**
- Modify: `backend/crops/models.py` (add `DiseaseRiskRule`)
- Modify: `backend/crops/admin.py`
- Create: `backend/crops/migrations/0005_diseaseriskrule.py`
- Test: `backend/crops/tests.py` (add `DiseaseRiskRuleModelTests`)

**Interfaces:**
- Consumes: `Disease` (existing model), `CropStage` (Task A1).
- Produces: `DiseaseRiskRule` — `disease` (FK to `Disease`, `related_name="risk_rules"`), `applicable_stages` (M2M to `CropStage`, blank=True — empty means "any stage"), `humidity_min_percent`/`temp_min_celsius`/`temp_max_celsius`/`rainfall_min_mm` (all nullable), `consecutive_days_required` (PositiveSmallIntegerField, default 1), `risk_level` (CharField, choices `low`/`moderate`/`high`), `advisory_text` (TextField), `source_citation` (TextField).

- [ ] **Step 1: Write the failing test**

```python
class DiseaseRiskRuleModelTests(TestCase):
    def test_rule_with_no_applicable_stages_means_any_stage(self):
        crop = Crop.objects.create(name="Arecanut")
        disease = Disease.objects.create(crop=crop, name="Mahali / Koleroga (Bud Rot)")
        rule = DiseaseRiskRule.objects.create(
            disease=disease, humidity_min_percent=85, rainfall_min_mm=10,
            consecutive_days_required=3, risk_level="high",
            advisory_text="Inspect for bud rot.", source_citation="ICAR-CPCRI Kasaragod advisory.",
        )
        self.assertEqual(rule.applicable_stages.count(), 0)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python manage.py test crops.tests.DiseaseRiskRuleModelTests -v 2`
Expected: FAIL — `DiseaseRiskRule` not defined.

- [ ] **Step 3: Implement `DiseaseRiskRule`**

Add the model as specified; register in admin with `list_display = ("disease", "risk_level", "consecutive_days_required")`.

- [ ] **Step 4: Generate and apply the migration, then run the test to verify it passes**

Run: `python manage.py makemigrations crops && python manage.py migrate`
Run: `python manage.py test crops.tests.DiseaseRiskRuleModelTests -v 2` — Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/crops/models.py backend/crops/admin.py backend/crops/migrations/0005_diseaseriskrule.py backend/crops/tests.py
git commit -m "feat: add DiseaseRiskRule model"
```

---

### Task B2: Research & seed real `DiseaseRiskRule` content

**Files:**
- Modify: `backend/crops/management/commands/seed_demo_data.py`
- Test: `backend/crops/tests.py` (add `DiseaseRiskRuleSeedContentTests`)

**Interfaces:**
- Consumes: `DiseaseRiskRule` (B1), the real seeded `Disease` rows (enumerate via `Disease.objects.all()` — do not hardcode a count, since the exact number is whatever `seed_demo_data.py` already creates).
- Produces: every seeded `Disease` has at least one `DiseaseRiskRule` row with real, cited thresholds.

- [ ] **Step 1: Write the failing test**

```python
class DiseaseRiskRuleSeedContentTests(TestCase):
    def setUp(self):
        call_command("seed_demo_data")

    def test_every_disease_has_at_least_one_risk_rule(self):
        for disease in Disease.objects.all():
            self.assertGreater(disease.risk_rules.count(), 0, f"{disease.name} has no DiseaseRiskRule")

    def test_every_risk_rule_has_a_real_citation_and_advisory_text(self):
        for rule in DiseaseRiskRule.objects.all():
            self.assertTrue(rule.source_citation.strip())
            self.assertGreater(len(rule.source_citation.strip()), 15)  # not a one-word placeholder
            self.assertTrue(rule.advisory_text.strip())
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python manage.py test crops.tests.DiseaseRiskRuleSeedContentTests -v 2`
Expected: FAIL — no rules exist yet.

- [ ] **Step 3: Research and implement the seed content**

For each of the seeded diseases, research real favoring-condition thresholds from the sources
listed in `USP_FEATURES_DESIGN.md` section 5 (ICAR-CPCRI Kasaragod first for Arecanut/Cocoa
diseases, Karnataka extension material for Pepper/Rice, cross-checked against at least one other
source). Add a `_seed_risk_rules()` helper in `seed_demo_data.py`, called once after all
diseases/stages exist, building each `DiseaseRiskRule` with its real `source_citation` naming the
actual publication/institute. Link `applicable_stages` to the relevant `CropStage` rows where a
disease is genuinely stage-specific (e.g. flowering-stage susceptibility); leave it empty where a
disease is a year-round risk.

- [ ] **Step 4: Run test to verify it passes**

Run: `python manage.py test crops.tests.DiseaseRiskRuleSeedContentTests -v 2`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/crops/management/commands/seed_demo_data.py backend/crops/tests.py
git commit -m "feat: seed researched DiseaseRiskRule content for all diseases"
```

---

### Task B3: Weather forecast helper

**Files:**
- Create: `backend/weather/forecast.py`
- Test: `backend/weather/tests.py` (add `ForecastHelperTests`)

**Interfaces:**
- Produces: `fetch_forecast_summary(location: str) -> dict | None` in `forecast.py` — calls OpenWeatherMap's free `https://api.openweathermap.org/data/2.5/forecast` endpoint (`q=location`, same `appid`/`units=metric` pattern as `weather/views.py`'s existing current-conditions call), reads the next 3 days of 3-hourly entries, and returns `{"max_humidity_percent": int, "min_temp_celsius": float, "max_temp_celsius": float, "total_rainfall_mm": float, "qualifying_days": int}` where `qualifying_days` is deliberately left for the caller to compute per-rule (this function returns raw aggregates, not a verdict — keeps risk-rule logic in one place, Task B4). Returns `None` on any failure (missing key, network error, non-200, malformed JSON) — mirrors `weather/views.py`'s existing `try/except requests.RequestException` plus status-code checks, factored out so Task B4 can reuse it without duplicating that error handling.

- [ ] **Step 1: Write the failing test**

```python
class ForecastHelperTests(TestCase):
    @override_settings(OPENWEATHER_API_KEY="test-key")
    @patch("weather.forecast.requests.get")
    def test_returns_none_on_network_error(self, mock_get):
        mock_get.side_effect = requests.RequestException()
        self.assertIsNone(fetch_forecast_summary("Puttur"))

    @override_settings(OPENWEATHER_API_KEY="test-key")
    @patch("weather.forecast.requests.get")
    def test_aggregates_humidity_and_rainfall_from_3hourly_entries(self, mock_get):
        mock_get.return_value = Mock(status_code=200, json=lambda: {
            "list": [
                {"main": {"humidity": 90, "temp": 24}, "rain": {"3h": 2.0}},
                {"main": {"humidity": 95, "temp": 26}, "rain": {"3h": 1.5}},
            ]
        })
        result = fetch_forecast_summary("Puttur")
        self.assertEqual(result["max_humidity_percent"], 95)
        self.assertAlmostEqual(result["total_rainfall_mm"], 3.5)

    @override_settings(OPENWEATHER_API_KEY="")
    def test_returns_none_when_key_not_configured(self):
        self.assertIsNone(fetch_forecast_summary("Puttur"))
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python manage.py test weather.tests.ForecastHelperTests -v 2`
Expected: FAIL — `forecast.py` doesn't exist.

- [ ] **Step 3: Implement `fetch_forecast_summary`**

Create `backend/weather/forecast.py` as specified; reuse `REQUEST_TIMEOUT_SECONDS` and the
`OPENWEATHER_API_KEY` settings lookup exactly as `weather/views.py` already does (import the
constant rather than redefining it, or duplicate the single line if importing from `views.py` would
create an awkward cross-import — prefer a tiny shared `weather/constants.py` only if this becomes
genuinely duplicated in a third place later; for now a direct `getattr(settings, ...)` call in both
files is fine and matches this codebase's existing level of DRY-ness).

- [ ] **Step 4: Run test to verify it passes**

Run: `python manage.py test weather.tests.ForecastHelperTests -v 2`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/weather/forecast.py backend/weather/tests.py
git commit -m "feat: add OpenWeatherMap forecast-aggregation helper"
```

---

### Task B4: Risk-alert endpoint

**Files:**
- Create: `backend/crops/risk_engine.py` (pure evaluation logic, separate from the view per this plan's file-structure preference for focused files)
- Modify: `backend/crops/views.py` (add `RiskAlertsView`)
- Modify: `backend/crops/urls.py`
- Test: `backend/crops/tests.py` (add `RiskAlertsViewTests`, `RiskEngineTests`)

**Interfaces:**
- Consumes: `FarmerCropTracker`/`derive_stage_for_tracker` (A4), `DiseaseRiskRule` (B1/B2), `fetch_forecast_summary` (B3).
- Produces: `evaluate_risk(tracker: FarmerCropTracker, forecast: dict) -> list[dict]` in `risk_engine.py` — returns every matching `DiseaseRiskRule` for the tracker's crop+current stage whose thresholds the forecast satisfies, each as `{"disease_name", "risk_level", "advisory_text", "source_citation"}`, sorted highest-risk first. `GET /crops/risk-alerts/` — for the authenticated farmer's active tracker(s): no trackers → `{"trackers": []}` (200, not an error); no `home_location` set → `{"detail": "Set your location on your profile to see risk alerts."}` (200 with an explanatory `detail`, not an error status, since this is a normal incomplete-setup state, not a failure); forecast fetch failure → `503` with the same plain-language pattern as the existing Weather proxy. Cached per `(location, crop_id, stage_id)` for a short TTL (same pattern as `locator`), since the forecast itself doesn't change minute to minute. `crops/views.py` imports `fetch_forecast_summary` via `from weather.forecast import fetch_forecast_summary`, so tests patch it at `crops.views.fetch_forecast_summary` (patch-where-used, not patch-where-defined).

- [ ] **Step 1: Write the failing test**

```python
class RiskEngineTests(TestCase):
    def test_rule_matches_when_forecast_meets_every_threshold(self):
        # rule needs humidity>=85 and rainfall>=10; forecast has both
        ...  # construct tracker/rule/forecast dict, assert evaluate_risk returns it

    def test_rule_does_not_match_when_one_threshold_is_unmet(self):
        ...

class RiskAlertsViewTests(APITestCase):
    def test_no_trackers_returns_empty_list_not_error(self):
        self.client.force_authenticate(self.farmer)
        response = self.client.get("/crops/risk-alerts/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["trackers"], [])

    def test_no_home_location_returns_explanatory_detail_not_error(self):
        FarmerCropTracker.objects.create(farmer=self.farmer, crop=self.rice)
        self.client.force_authenticate(self.farmer)
        response = self.client.get("/crops/risk-alerts/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn("location", response.data["detail"].lower())

    @patch("crops.views.fetch_forecast_summary", return_value=None)
    def test_forecast_failure_is_503_not_500(self, mock_fetch):
        self.farmer.home_location = "Puttur"; self.farmer.save()
        FarmerCropTracker.objects.create(farmer=self.farmer, crop=self.rice)
        self.client.force_authenticate(self.farmer)
        response = self.client.get("/crops/risk-alerts/")
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python manage.py test crops.tests.RiskEngineTests crops.tests.RiskAlertsViewTests -v 2`
Expected: FAIL — not implemented.

- [ ] **Step 3: Implement `evaluate_risk` and `RiskAlertsView`**

`evaluate_risk` is a plain function: filter `DiseaseRiskRule.objects.filter(disease__crop=tracker.crop)`
further narrowed to rules whose `applicable_stages` is empty or includes `tracker.current_stage`,
then keep only rules whose every non-null threshold field the forecast dict satisfies (`>=` for
humidity/rainfall/`consecutive_days_required` vs the forecast's own day-count, `<=`/`>=` for the
temp range) — this is the one place real comparison logic lives, write it directly, there's no
ambiguity left once the test cases above pin the expected behavior. `RiskAlertsView` (an `APIView`,
`permissions.IsAuthenticated`) handles the three early-return cases from Interfaces above, then for
each active tracker calls `fetch_forecast_summary(request.user.home_location)`, caches the result
(`cache.get`/`cache.set`, same pattern as `locator/views.py`), and calls `evaluate_risk`.

- [ ] **Step 4: Run test to verify it passes, then run the full backend suite**

Run: `python manage.py test crops.tests.RiskEngineTests crops.tests.RiskAlertsViewTests -v 2` then `python manage.py test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/crops/risk_engine.py backend/crops/views.py backend/crops/urls.py backend/crops/tests.py
git commit -m "feat: add proactive disease-risk-alert endpoint"
```

---

### Task B5: Frontend dynamic risk-alert dashboard card

**Files:**
- Modify: `frontend/src/api/cropTracker.js` (add `fetchRiskAlerts`)
- Modify: `frontend/src/pages/DashboardPage.jsx`
- Modify: `frontend/src/i18n/locales/{en,kn,hi}.json`
- Test: `frontend/src/pages/DashboardPage.test.jsx`

**Interfaces:**
- Consumes: `GET /crops/risk-alerts/` (Task B4).
- Produces: `fetchRiskAlerts()` in `api/cropTracker.js`. `DashboardPage.jsx`'s existing static
  `.dashboard-highlight-weather` card (currently a plain link, see the file read during design) is
  replaced with a version that, when a risk alert exists, shows the disease name + risk level
  inline instead of the static `dashboard.highlights.weatherDesc` text; falls back to exactly the
  current static behavior when there's no active tracker or no risk alert — this is additive to the
  existing dashboard structure, not a rewrite of it.

- [ ] **Step 1: Write the failing test**

```jsx
it("shows a real risk alert on the weather highlight card when one exists", async () => {
  vi.mocked(fetchRiskAlerts).mockResolvedValue({ trackers: [{ disease_name: "Mahali / Koleroga (Bud Rot)", risk_level: "high" }] });
  render(<DashboardPage />);
  expect(await screen.findByText(/Koleroga/i)).toBeInTheDocument();
});

it("falls back to the static teaser when there is no risk alert", async () => {
  vi.mocked(fetchRiskAlerts).mockResolvedValue({ trackers: [] });
  render(<DashboardPage />);
  expect(await screen.findByText(/today.?s weather/i)).toBeInTheDocument(); // existing static copy
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/pages/DashboardPage.test.jsx`
Expected: FAIL — card doesn't fetch/show risk data yet.

- [ ] **Step 3: Implement**

Add `fetchRiskAlerts` to `api/cropTracker.js` (same thin-wrapper style). In `DashboardPage.jsx`, add
a `useEffect` fetching risk alerts on mount, state for the result, and conditionally render the
highlight card's description text from the alert when present, the existing static
`t("dashboard.highlights.weatherDesc")` otherwise. Add i18n keys for the alert phrasing
(`dashboard.highlights.riskAlertText` with `{{disease}}` interpolation) to all three locales.

- [ ] **Step 4: Run test to verify it passes, then the full frontend suite**

Run: `npx vitest run src/pages/DashboardPage.test.jsx` then `npm test && npm run build`
Expected: all PASS, build clean.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/cropTracker.js frontend/src/pages/DashboardPage.jsx frontend/src/pages/DashboardPage.test.jsx frontend/src/i18n/locales/
git commit -m "feat: show real proactive risk alerts on the dashboard"
```

---

### Task B6: Phase B verification & device push

- [ ] **Step 1:** Full backend + frontend suites in the cloud mirror, all passing.
- [ ] **Step 2:** Live Playwright verification: farmer with an active Arecanut tracker and a saved location sees a real risk-alert card reflecting the actual current OpenWeatherMap forecast for that location (confirm against the real API response, not a mock, for at least one manual check).
- [ ] **Step 3:** Push, double sha256-verify, commit on the device.
- [ ] **Step 4:** Update `PROJECT_STATUS.md`/`NEXT_STEPS.md`.

---

## Phase C — Task Reminders

### Task C1: `CropTask` model

**Files:**
- Modify: `backend/crops/models.py`
- Modify: `backend/crops/admin.py`
- Create: `backend/crops/migrations/0006_croptask.py`
- Test: `backend/crops/tests.py` (add `CropTaskModelTests`)

**Interfaces:**
- Produces: `CropTask` — `crop` (FK), `stage` (FK to `CropStage`, `related_name="tasks"`), `category` (CharField, choices `irrigation`/`fertilizer`/`spraying`/`pruning`/`other`), `instruction` (TextField), `source_citation` (TextField).

- [ ] **Step 1: Write the failing test** — a straightforward creation/field test, same shape as `DiseaseRiskRuleModelTests` (Task B1 Step 1), substituting `CropTask`'s fields.
- [ ] **Step 2: Run test to verify it fails.**
- [ ] **Step 3: Implement `CropTask`** exactly as specified; register in admin.
- [ ] **Step 4: Migrate, then run test to verify it passes.**
- [ ] **Step 5: Commit**

```bash
git add backend/crops/models.py backend/crops/admin.py backend/crops/migrations/0006_croptask.py backend/crops/tests.py
git commit -m "feat: add CropTask model"
```

---

### Task C2: Research & seed real `CropTask` content

**Files:**
- Modify: `backend/crops/management/commands/seed_demo_data.py`
- Test: `backend/crops/tests.py` (add `CropTaskSeedContentTests`)

**Interfaces:**
- Consumes: `CropTask` (C1), the real seeded `CropStage` rows (A2).
- Produces: every `CropStage` has at least one `CropTask` row, researched and cited the same way as Task B2.

- [ ] **Step 1: Write the failing test** — same shape as `DiseaseRiskRuleSeedContentTests` (Task B2 Step 1): every stage has ≥1 task, every task has a real, non-trivial `source_citation` and non-empty `instruction`.
- [ ] **Step 2: Run test to verify it fails.**
- [ ] **Step 3: Research and implement.** For each crop+stage, research real irrigation/fertilizer/spraying timing from the same section-5 source list (ICAR-CPCRI for Arecanut/Cocoa stage-specific work, Karnataka extension material for Pepper/Rice), add a `_seed_crop_tasks()` helper following the same pattern as `_seed_risk_rules()`.
- [ ] **Step 4: Run test to verify it passes.**
- [ ] **Step 5: Commit**

```bash
git add backend/crops/management/commands/seed_demo_data.py backend/crops/tests.py
git commit -m "feat: seed researched CropTask content for every crop stage"
```

---

### Task C3: "Tasks for today" endpoint

**Files:**
- Modify: `backend/crops/views.py` (add `TodaysTasksView`)
- Modify: `backend/crops/serializers.py` (add `CropTaskSerializer`)
- Modify: `backend/crops/urls.py`
- Test: `backend/crops/tests.py` (add `TodaysTasksViewTests`)

**Interfaces:**
- Consumes: `FarmerCropTracker` (A4/A5), `CropTask` (C1/C2).
- Produces: `GET /crops/tasks/today/` — for the farmer's active tracker(s), returns
  `{"tasks": [...]}` where each entry is `CropTask` rows matching the tracker's crop + **current**
  stage only, serialized via `CropTaskSerializer` (`fields = ["id", "category", "instruction"]` —
  `source_citation` stays internal/admin-only, not farmer-facing). No trackers → `{"tasks": []}`,
  200, not an error (same pattern as Task B4).

- [ ] **Step 1: Write the failing test**

```python
class TodaysTasksViewTests(APITestCase):
    def test_no_trackers_returns_empty_list_not_error(self):
        self.client.force_authenticate(self.farmer)
        response = self.client.get("/crops/tasks/today/")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["tasks"], [])

    def test_returns_only_tasks_for_current_stage_not_other_stages(self):
        tracker = FarmerCropTracker.objects.create(farmer=self.farmer, crop=self.rice, current_stage=self.flowering)
        CropTask.objects.create(crop=self.rice, stage=self.flowering, category="irrigation", instruction="Irrigate every 3 days.", source_citation="x" * 20)
        CropTask.objects.create(crop=self.rice, stage=self.germination, category="irrigation", instruction="Different stage task.", source_citation="x" * 20)
        self.client.force_authenticate(self.farmer)
        response = self.client.get("/crops/tasks/today/")
        self.assertEqual(len(response.data["tasks"]), 1)
        self.assertIn("every 3 days", response.data["tasks"][0]["instruction"])
```

- [ ] **Step 2: Run test to verify it fails.**
- [ ] **Step 3: Implement `TodaysTasksView` and `CropTaskSerializer`** exactly as specified.
- [ ] **Step 4: Run test to verify it passes, then run the full backend suite.**
- [ ] **Step 5: Commit**

```bash
git add backend/crops/views.py backend/crops/serializers.py backend/crops/urls.py backend/crops/tests.py
git commit -m "feat: add Today's Tasks endpoint"
```

---

### Task C4: Frontend "Today's Tasks" dashboard card

**Files:**
- Modify: `frontend/src/api/cropTracker.js` (add `fetchTodaysTasks`)
- Modify: `frontend/src/pages/DashboardPage.jsx`
- Modify: `frontend/src/App.css` (new `.dashboard-tasks-card`/`.dashboard-task-item` rules, following the existing `.dashboard-highlight-card` styling pattern — additive, no existing selector changed)
- Modify: `frontend/src/i18n/locales/{en,kn,hi}.json`
- Test: `frontend/src/pages/DashboardPage.test.jsx`

**Interfaces:**
- Consumes: `GET /crops/tasks/today/` (Task C3).
- Produces: `fetchTodaysTasks()` in `api/cropTracker.js`. A new card on the dashboard, placed after
  the existing `.dashboard-highlights` grid and before the "Quick Actions" section heading, listing
  each task's category + instruction; renders nothing (not an empty card) when the farmer has no
  tasks for today, same "absence is silence, not a frame around nothing" principle this dashboard
  already follows for its other conditional content.

- [ ] **Step 1: Write the failing test**

```jsx
it("shows today's tasks when the farmer has an active tracker", async () => {
  vi.mocked(fetchTodaysTasks).mockResolvedValue({ tasks: [{ id: 1, category: "irrigation", instruction: "Irrigate every 3 days." }] });
  render(<DashboardPage />);
  expect(await screen.findByText(/irrigate every 3 days/i)).toBeInTheDocument();
});

it("renders no tasks card when there are no tasks", async () => {
  vi.mocked(fetchTodaysTasks).mockResolvedValue({ tasks: [] });
  render(<DashboardPage />);
  expect(screen.queryByTestId("dashboard-tasks-card")).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails.**
- [ ] **Step 3: Implement.** Add `fetchTodaysTasks` to `api/cropTracker.js`; fetch on mount in
  `DashboardPage.jsx` alongside the risk-alerts fetch (Task B5); render the new card (with
  `data-testid="dashboard-tasks-card"`) only when `tasks.length > 0`. Add the CSS rules and i18n
  keys (`dashboard.tasksCardTitle`, category labels) to all three locales.
- [ ] **Step 4: Run test to verify it passes, then the full frontend suite.**

Run: `npx vitest run src/pages/DashboardPage.test.jsx` then `npm test && npm run build`

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/cropTracker.js frontend/src/pages/DashboardPage.jsx frontend/src/App.css frontend/src/pages/DashboardPage.test.jsx frontend/src/i18n/locales/
git commit -m "feat: add Today's Tasks dashboard card"
```

---

### Task C5: Phase C verification, device push, and final docs update

- [ ] **Step 1:** Full backend + frontend suites, all passing; run the project's usual class-selector diff on `App.css` to confirm only additive changes.
- [ ] **Step 2:** Live Playwright verification: farmer with an active tracker sees real, stage-matched tasks on the dashboard; a farmer with no tracker sees neither new card, unchanged from today's dashboard.
- [ ] **Step 3:** Push every changed file, double sha256-verify, commit on the device.
- [ ] **Step 4:** Update `PROJECT_STATUS.md`/`NEXT_STEPS.md` with the complete feature (all three phases), the real final commit hash, updated cumulative test counts, and an honest note of anything deferred (task-completion checkboxes, multi-plot tracking — per the spec's explicit out-of-scope list).
