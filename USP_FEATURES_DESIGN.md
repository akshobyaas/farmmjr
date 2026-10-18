# USP Features Design — Crop Lifecycle Tracker, Proactive Risk Alerts, and Task Reminders

**Status:** Approved design, ready for implementation planning.
**Date:** 2026-10-18
**Context:** The project's guide has pushed for a clear answer to "what are you creating new in
this" — not just a regional crop list, but a real novelty claim. `PROJECT_SCOPE_PIVOT.md` already
named the agreed angle (proactive disease-risk alerts using weather + crop growth stage, before
symptoms appear, combined with Kannada-first hyperlocal design) but it was never actually built —
Weather today is a passive lookup page with no connection to crop/disease data at all. Separately, a
rival team's "Smart Farming with Regional Dialect Voice Assistance" pitch prompted a second
differentiator: Kannada voice input/output on the Advisory/Chatbot pages (designed separately from
this doc — see the companion voice-interaction design once this is built).

This doc covers the first, larger piece: a **Crop Stage Tracker** foundation, with **proactive
disease-risk alerts** and **task reminders** built on top of it. Together these turn "detect disease
after the fact" into "track your crop's real lifecycle and get warned/reminded before problems
happen" — a concrete, demoable answer to the guide's novelty question.

---

## 1. Why a tracker is needed (not just weather + disease data)

Checked directly against the real codebase before designing anything:

- **Rice is annual** — `Lifecycle` already has day-based stages (Germination 5-10 days → Vegetative
  20-45 days → Flowering 45-65 days → Harvest 100-140 days). A planting date cleanly derives current
  stage.
- **Arecanut, Black Pepper, and Cocoa are perennial plantation crops.** Their existing `Lifecycle`
  rows describe *years since planting until first bearing* (e.g. Arecanut: first flowering at 5-7
  years, then productive for 40-60 years) — not a recurring annual cycle. A real smallholder almost
  certainly already has a mature, bearing plantation, so "years since planting" tells us nothing
  useful about this week's disease risk or this week's task. What matters is the **recurring annual
  phenological phase** (vegetative flush / flowering / fruit development / harvest) — data that does
  not exist in the DB yet and needs to be written, grounded in real regional sources (section 5).
- **`FertilizerSchedule` is an explicit placeholder** per its own seed-script comment ("a light,
  generic fertilizer/irrigation guidance placeholder per crop," only 2 stages: Establishment and
  Bearing) — not enough to build real per-stage task reminders from as-is.
- **The Weather proxy (`backend/weather/`) only calls OpenWeatherMap's current-conditions endpoint**,
  not a forecast, and a real API key is now configured (confirmed on-device — `OPENWEATHER_API_KEY`
  is set, 32 chars). There is no background job scheduler in this project (no Celery/cron in
  `requirements.txt`), so "proactive" must mean checking a forecast on demand, not polling and
  storing history.
- **No farmer has a stored location anywhere.** Weather today takes an ad-hoc city/GPS per visit.
  For alerts to be proactive (visible without the farmer opening the Weather page), a farmer needs a
  saved location.

---

## 2. Data model

### 2.1 `accounts` app — one new field

- `User.home_location` (`CharField`, blank-allowed, free-text city/place name — matches the existing
  `city=` query param the Weather proxy already accepts, so no new geocoding logic is needed). Set
  once from the Profile page; reused by the risk-alert engine.

### 2.2 `crops` app — three new models

**`CropStage`** — the farmer-trackable "current stage" list, distinct from the existing `Lifecycle`
model (which keeps its original job: explaining a crop's life story on the Crop Detail page).

```python
class CropStage(models.Model):
    crop = models.ForeignKey(Crop, on_delete=models.CASCADE, related_name="trackable_stages")
    name = models.CharField(max_length=100)
    # Rice (annual): day-offsets from planting_date, used to auto-derive current stage.
    day_range_start = models.PositiveIntegerField(null=True, blank=True)
    day_range_end = models.PositiveIntegerField(null=True, blank=True)
    # Perennial crops: typical calendar months for this phase in the target belt
    # (Dakshina Kannada/Shivamogga/Udupi), used only to pick a sensible default —
    # never to silently override a farmer's own correction.
    typical_month_start = models.PositiveSmallIntegerField(null=True, blank=True)
    typical_month_end = models.PositiveSmallIntegerField(null=True, blank=True)
    order = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["crop__name", "order"]
```

**`FarmerCropTracker`** — one active tracker per (farmer, crop), per the approved "one active tracker
per crop type" decision.

```python
class FarmerCropTracker(models.Model):
    farmer = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="crop_trackers")
    crop = models.ForeignKey(Crop, on_delete=models.CASCADE)
    planting_date = models.DateField(null=True, blank=True)  # Rice: required; perennials: optional/unused
    current_stage = models.ForeignKey(CropStage, on_delete=models.SET_NULL, null=True)
    stage_confirmed_at = models.DateField(auto_now=True)  # last time the farmer confirmed/corrected the stage
    is_active = models.BooleanField(default=True)

    class Meta:
        unique_together = ("farmer", "crop")
```

Stage derivation logic (a plain Python helper, not stored): for Rice, compute `days_since_planting =
today - planting_date` and look up the matching `CropStage` by day range. For perennial crops, default
to whichever `CropStage` row's typical-month range contains today's month, but always let the farmer
override via a simple picker — the derived value is a *suggestion*, never silently authoritative,
since real conditions can run ahead or behind the textbook calendar.

**`DiseaseRiskRule`** — per disease, weather-condition thresholds plus the stage(s) it applies to.

```python
class DiseaseRiskRule(models.Model):
    disease = models.ForeignKey(Disease, on_delete=models.CASCADE, related_name="risk_rules")
    applicable_stages = models.ManyToManyField(CropStage, blank=True)  # empty = applies at any stage
    humidity_min_percent = models.PositiveSmallIntegerField(null=True, blank=True)
    temp_min_celsius = models.FloatField(null=True, blank=True)
    temp_max_celsius = models.FloatField(null=True, blank=True)
    rainfall_min_mm = models.FloatField(null=True, blank=True)
    consecutive_days_required = models.PositiveSmallIntegerField(default=1)
    risk_level = models.CharField(max_length=20, choices=[("low", "Low"), ("moderate", "Moderate"), ("high", "High")])
    advisory_text = models.TextField()
    source_citation = models.TextField(help_text="Where this threshold comes from — cite properly.")
```

**`CropTask`** — per crop+stage, a farmer-facing task.

```python
class CropTask(models.Model):
    crop = models.ForeignKey(Crop, on_delete=models.CASCADE, related_name="tasks")
    stage = models.ForeignKey(CropStage, on_delete=models.CASCADE, related_name="tasks")
    category = models.CharField(max_length=20, choices=[
        ("irrigation", "Irrigation"), ("fertilizer", "Fertilizer"),
        ("spraying", "Spraying"), ("pruning", "Pruning"), ("other", "Other"),
    ])
    instruction = models.TextField()
    source_citation = models.TextField()
```

All four new models get a migration in the `crops` app (plus one in `accounts` for `home_location`).
No existing model's fields change — this is purely additive, so every existing test/endpoint keeps
working unchanged.

---

## 3. Backend endpoints

- `PATCH /accounts/me/` already exists and accepts profile fields — `home_location` is simply added
  to `ProfileSerializer`'s writable fields (mass-assignment protection already excludes server-only
  fields like `role`, so this is a one-line addition, not a new endpoint).
- `GET/POST /crops/trackers/` (new) — list the farmer's active trackers; create/update one (pick crop,
  set planting date or confirm/override stage). Ownership-scoped to the requesting farmer, same
  pattern as every other per-user resource in this app (e.g. `AdvisoryQuery`'s scoping).
- `GET /crops/risk-alerts/` (new) — for the farmer's active tracker(s), calls OpenWeatherMap's free
  5-day/3-hour forecast endpoint using `home_location`, aggregates forecasted humidity/temp/rainfall
  over the next ~3 days, evaluates against `DiseaseRiskRule` rows matching the tracked crop's current
  stage, and returns the single highest-risk result (plus the rest, for a "see all" view). Degrades
  gracefully — no location saved, no active tracker, or an upstream failure all return a plain
  `detail` message and an appropriate status code, never a raw 500, matching the Weather proxy's
  existing error-handling pattern exactly. Short server-side cache per location (same pattern as
  Locator/Videos) to avoid redundant OpenWeatherMap calls.
- `GET /crops/tasks/today/` (new) — for the farmer's active tracker(s), returns `CropTask` rows
  matching tracked crop + *current* stage only (not future stages, per the agreed v1 scope).

---

## 4. Frontend changes

- **Crop Detail page** (or a new small "Track this crop" flow reachable from it) — pick a crop to
  track, enter planting date (Rice) or confirm/override the suggested seasonal stage (perennials).
- **Profile page** — one new field, "Your location" (reuses the existing city-text-input pattern
  already proven on the Weather page).
- **Dashboard** — the existing static "Today's Weather" highlight card becomes a real, dynamic risk
  alert when the farmer has an active tracker + saved location (e.g. *"⚠️ Conditions favor Koleroga
  in your Arecanut this week — here's what to check."*), linking through to full detail if more than
  one tracked crop has a risk. A new "Today's Tasks" card lists the current stage's tasks. Both cards
  fall back to their existing static/teaser behavior when the farmer has no active tracker yet — this
  is additive, not a replacement of the dashboard's existing structure.
- All new farmer-facing strings go through the existing i18n system (en/kn/hi) — detailed rule/task
  *content* (the actual advisory/instruction text) stays English-only for v1, matching this project's
  existing, already-documented convention for disease/recommendation/lifecycle detail content.

---

## 5. Content research (risk rules, task instructions, perennial-crop seasonal stages)

This is real research work, not placeholder text — to be done during implementation, prioritizing
sources specific to the Dakshina Kannada/Shivamogga/Udupi belt and these exact crops over generic
agriculture sites:

- **ICAR-CPCRI, Kasaragod** — the premier public research institute for Arecanut and Cocoa,
  geographically adjacent to the target belt; its advisories are the single best source for
  Arecanut/Cocoa disease epidemiology (e.g. Koleroga/Mahali favoring conditions) and phenology.
- **Karnataka university extension material** (UAS Bangalore, UAS Shivamogga/Zonal Agricultural
  Research Stations) for region-specific Black Pepper and Rice guidance.
- **Campco** (the real cooperative already named in this project's scope doc) — farmer-facing
  material where available.
- **Karnataka Department of Horticulture** advisories.
- **Regional agricultural journalism and farmer accounts** (Krishi Jagran, The Hindu's agriculture
  coverage, Kannada farming press) for on-the-ground, locally-specific detail that formal literature
  sometimes misses — genuinely read and cross-check these, not a single generic source copy-pasted
  across every disease.

Every `DiseaseRiskRule` and `CropTask` row's `source_citation` field must name its actual source
(publication/institute + what it says), so this is defensible in a viva and in a written report —
not just plausible-sounding numbers.

---

## 6. Explicitly out of scope for this pass

- Multiple named plots per crop (one active tracker per crop type only, per the approved decision).
- Task completion/checkbox tracking (needs its own completion-tracking model and reset logic; a
  natural v2, not needed to demonstrate the core USP).
- Historical weather storage / trend-based risk (no scheduler exists; forecast-based risk is both
  simpler to build and more literally "proactive" than a backward-looking trend would be).
- Voice input/output (Kannada STT/TTS) — a separate feature, designed and built after this one.
- The three Tier-2/3 items from the earlier scoping conversation (finishing i18n on the 4 remaining
  auth pages, farmer-notified-when-answered, Cocoa/Arecanut-Foot-Rot/Cocoa-VSD disease detection) —
  tracked separately, not part of this spec.

---

## 7. Testing & rollout

Follows this project's standing working style exactly: build and verify in the cloud mirror first
(backend `manage.py test` for the new models/endpoints/serializers — ownership-scoping and
mass-assignment tests especially, given the per-farmer tracker data; frontend Vitest for the new
components and dashboard card changes; `npm run build` clean), live-verify the real flow with
Playwright against real dev servers (track a crop, see a stage-derived or farmer-corrected stage, see
a dashboard risk alert and task list reflecting it), then push to the device via `device_commit_files`
with independent sha256 verification, commit, and update `PROJECT_STATUS.md`/`NEXT_STEPS.md`.
