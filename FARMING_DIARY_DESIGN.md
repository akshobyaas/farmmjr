# Farming Diary Design — AI-Analyzed Daily Log for Tracked Crops

**Status:** Approved design, ready for implementation planning.
**Date:** 2026-10-19
**Context:** The Crop Lifecycle Tracker (`USP_FEATURES_DESIGN.md`) shipped a `current_stage` picker
farmers set occasionally, which exists only to drive the disease-risk-alert and task-reminder
engines behind the scenes. Reviewing it in practice, the user flagged the real gap: a farmer has no
way to actually log their day-to-day — what work they did today, what the crop looks like today,
anything unusual they noticed. This doc adds that missing layer: a daily diary, read by an AI model,
that gives the farmer back a short, grounded analysis — warnings, suggestions, advice — instead of
silently storing text no one ever looks at again.

This is **additive**, not a replacement. `FarmerCropTracker.current_stage` keeps doing its existing
job (feeding `risk_engine.py` and `TodaysTasksView`) exactly as before. The diary is a second, richer
layer sitting next to it.

---

## 1. What a farmer actually does

Each day (optional — nothing forces a daily entry), on their tracked crop's page, a farmer can log:

- **Structured activities** — four checkboxes mirroring `CropTask.Category` exactly (irrigation,
  fertilizer, spraying, pruning), plus an "other" checkbox with its own short text field for
  anything not covered by the first four. Reusing `CropTask.Category` rather than inventing a
  parallel vocabulary keeps the two features conceptually aligned.
- **A free-text note** — "anything else," in the farmer's own words. This is deliberately NOT
  keyword-matched (a real farmer's phrasing can't be predicted); it's handed to the AI as-is.
- **An optional photo** — automatically run through the existing Phase 9/10 CNN pipeline
  (`scans.ml_model.predict()` / `disease_lookup()`), exactly like the main Scan feature. No new ML
  work: this reuses the already-trained model and its existing graceful-degradation behavior
  (`predict()` returns `(None, None)` if the model isn't loaded or inference fails — treated as "no
  diagnosis available," never an error).

One entry per tracker per calendar day — resubmitting the same day **updates** that day's entry
rather than creating a duplicate (mirrors a farmer correcting or adding to today's log, not spamming
new rows).

## 2. Data model

New model in `crops/models.py`:

```python
class FarmingDiaryEntry(models.Model):
    tracker = models.ForeignKey(FarmerCropTracker, on_delete=models.CASCADE, related_name="diary_entries")
    entry_date = models.DateField()  # defaults to today at the serializer/view level

    did_irrigation = models.BooleanField(default=False)
    did_fertilizer = models.BooleanField(default=False)
    did_spraying = models.BooleanField(default=False)
    did_pruning = models.BooleanField(default=False)
    other_activity_note = models.CharField(max_length=200, blank=True)

    note = models.TextField(blank=True)  # the free-text diary entry
    photo = models.ImageField(upload_to="diary_photos/", null=True, blank=True)

    # Populated automatically from scans.ml_model if `photo` is set.
    photo_diagnosis_label = models.CharField(max_length=100, blank=True)
    photo_diagnosis_confidence = models.FloatField(null=True, blank=True)

    class AnalysisStatus(models.TextChoices):
        OK = "ok", "OK"
        UNAVAILABLE = "unavailable", "Unavailable"

    ai_analysis = models.TextField(blank=True)
    ai_analysis_status = models.CharField(max_length=20, choices=AnalysisStatus.choices, default=AnalysisStatus.UNAVAILABLE)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ("tracker", "entry_date")
        ordering = ["-entry_date"]
```

A farmer can only have one tracker per crop already (`FarmerCropTracker`'s own
`unique_together("farmer", "crop")`), so `tracker` alone correctly scopes a diary to one farmer's one
tracked crop — no separate `farmer` FK needed, same pattern `CropTask`'s own queries already rely on
indirectly.

## 3. The AI call

**Provider: Google Gemini** (free tier — the right call for a no-budget student project; quality is
more than sufficient for grounded, practical advice on short farm notes). New setting
`GEMINI_API_KEY = env('GEMINI_API_KEY', default='')` in `config/settings.py`, read the exact same
blank-key-fails-soft way `OPENWEATHER_API_KEY` already is — same pattern, same file, same line
style.

On submit (`FarmingDiaryEntryViewSet.create`/`update`), after the entry itself is saved and the photo
(if any) has been run through the CNN:

1. Build a prompt containing: the crop's name, the tracker's `current_stage.name` (if set), which
   activities were ticked today, the free-text note, the photo's diagnosis label + confidence (if
   any), and the farmer's **last 5** diary entries for this tracker (`note` + `ai_analysis`,
   oldest-to-newest) as context — so advice is grounded in this specific crop's recent real history,
   not a cold read of one isolated note.
2. Call Gemini with a short system instruction: respond as a practical agricultural advisor, keep it
   brief (2-4 sentences), flag anything concerning, suggest a concrete next step if relevant, and say
   plainly if nothing stands out — never invent a diagnosis the CNN didn't actually report.
3. On success: store the response in `ai_analysis`, `ai_analysis_status = OK`.
4. **On any failure** (missing key, network error, timeout, non-200, malformed response): store
   `ai_analysis_status = UNAVAILABLE`, leave `ai_analysis` blank. **The entry still saves** — exactly
   the same fail-soft contract `weather/forecast.py` and `scans/ml_model.py` already use: an
   unreachable third-party service degrades one feature, never blocks the farmer's own data from
   being recorded. A 5-second timeout, matching `weather/forecast.py`'s `REQUEST_TIMEOUT_SECONDS`.

This mirrors the exact constraint already documented for OpenWeatherMap: this cloud sandbox's egress
proxy almost certainly can't reach Gemini's API either, so the real happy path (a real note producing
real AI advice) will need to be verified by the user on their own device, same as Weather and the
disease-risk alerts.

## 4. Frontend

A new "Daily Log" section on `CropDetailPage.jsx`, visible only once a tracker exists for that crop
(same gating pattern the existing tracker section already uses). Two parts:

- **Today's entry form** — four activity checkboxes + "other" text field, the free-text note, a photo
  upload. Pre-fills from today's entry if one already exists (so re-opening the form to add more
  context is editing, not starting over).
- **A timeline below it** — past entries, most recent first, each showing what was logged that day
  and the AI's response (or, if `ai_analysis_status == "unavailable"`, a plain "Analysis couldn't be
  generated right now — your entry was still saved" message, never a raw error).

New `diary.js` API helper (`fetchDiaryEntries`, `saveDiaryEntry`), following the existing
`cropTracker.js` pattern exactly (same file, same project, same conventions).

## 5. Testing

- **Backend:** model tests (one-entry-per-day uniqueness, `tracker` scoping); serializer/view tests
  for create and same-day update; a test that a photo triggers the CNN pipeline and stores its
  result; a test that Gemini is **mocked** (never a real network call in the test suite — same
  reasoning `weather`'s tests already mock `fetch_forecast_summary`) for both the success and
  failure/timeout paths, asserting the entry still saves either way.
- **Frontend:** form submission, pre-fill-on-same-day-resubmit, timeline rendering, and the
  "analysis unavailable" fallback state.

## 6. Deliberately out of scope this round

- Editing or deleting a past day's entry once a later day has been logged (only "today" is editable).
- The AI following up on anything unclear at a later time — settled on immediate-only analysis; a
  deferred/resurfacing follow-up would need a notifications subsystem this project doesn't have.
- Multiple photos per entry.
- Voice input for the diary note — the separate, previously-discussed Kannada voice feature is its
  own future design, not folded into this one.

Real follow-ups if the user wants them later, not oversights.
