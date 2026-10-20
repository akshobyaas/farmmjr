import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { fetchCropDetail } from "../api/crops";
import { fetchTrackers, createTracker, updateTracker } from "../api/cropTracker";
import { fetchDiaryEntries, saveDiaryEntry } from "../api/diary";
import { localizeField } from "../i18n/localize";
import AppHeader from "../components/AppHeader";
import BottomNav from "../components/BottomNav";

export default function CropDetailPage() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const [crop, setCrop] = useState(null);
  const [error, setError] = useState("");

  // Task 6 -- the farmer's own tracker for this crop (at most one, per the
  // backend's unique_together("farmer", "crop")), plus the "Track This
  // Crop" form's local state. Tracking is secondary to the crop detail
  // itself, so a tracker-fetch failure is swallowed rather than shown as
  // a page-level error.
  const [tracker, setTracker] = useState(null);
  const [showTrackerForm, setShowTrackerForm] = useState(false);
  const [plantingDate, setPlantingDate] = useState("");
  const [selectedStageId, setSelectedStageId] = useState("");
  const [trackerSubmitting, setTrackerSubmitting] = useState(false);
  const [trackerError, setTrackerError] = useState("");

  // Task 6 -- the Daily Log (Farming Diary) form. `diaryEntries` holds
  // every entry fetched for this tracker (Task 7 renders it as a
  // reverse-chronological timeline below this form; we only ever read
  // today's entry out of it here). `diaryForm.didOther` is local-UI-only
  // state, not part of `saveDiaryEntry`'s field contract -- it just
  // drives whether the "other" text field is enabled, and is derived
  // back from `other_activity_note` on pre-fill (a non-empty note implies
  // the checkbox was ticked).
  const emptyDiaryForm = {
    didIrrigation: false,
    didFertilizer: false,
    didSpraying: false,
    didPruning: false,
    didOther: false,
    otherActivityNote: "",
    note: "",
    photoFile: null,
  };
  const [diaryEntries, setDiaryEntries] = useState([]);
  const [diaryForm, setDiaryForm] = useState(emptyDiaryForm);
  const [diarySubmitting, setDiarySubmitting] = useState(false);
  const [diaryError, setDiaryError] = useState("");

  useEffect(() => {
    setCrop(null);
    setError("");
    setTracker(null);
    setShowTrackerForm(false);
    setTrackerError("");

    fetchCropDetail(id)
      .then((data) => setCrop(data))
      .catch((err) => {
        if (err.response?.status === 404) {
          setError(t("crops.cropNotFound"));
        } else {
          setError(t("crops.cropLoadError"));
        }
      });

    fetchTrackers()
      .then((data) => {
        const match = data.find((tr) => String(tr.crop) === String(id));
        setTracker(match || null);
      })
      .catch(() => {
        // Nothing to track yet, or the request failed -- either way, the
        // page just falls back to offering "Track This Crop" from scratch.
      });
  }, [id, t]);

  // Task 6 -- the diary is a property of an active tracker, so it only
  // ever fetches once one exists (same gating the Daily Log section below
  // uses to render). Re-fetches whenever `tracker` changes identity,
  // which also covers the "Track This Crop" / "Update" flow handing back
  // a freshly created or updated tracker.
  useEffect(() => {
    if (!tracker) {
      setDiaryEntries([]);
      setDiaryForm(emptyDiaryForm);
      return;
    }
    fetchDiaryEntries(tracker.id)
      .then((entries) => {
        setDiaryEntries(entries);
        applyDiaryPrefill(entries);
      })
      .catch(() => {
        // Same fail-soft pattern as the tracker fetch above -- the diary
        // is secondary to the crop detail/tracker itself.
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracker]);

  const isDayBasedCrop = (crop?.trackable_stages || []).some(
    (stage) => stage.day_range_start != null
  );

  const openTrackerForm = () => {
    setTrackerError("");
    setPlantingDate(tracker?.planting_date || "");
    setSelectedStageId(tracker?.current_stage ? String(tracker.current_stage.id) : "");
    setShowTrackerForm(true);
  };

  const handleTrackerSubmit = async (e) => {
    e.preventDefault();
    setTrackerError("");
    setTrackerSubmitting(true);
    try {
      let saved;
      if (tracker) {
        const fields = isDayBasedCrop
          ? { planting_date: plantingDate }
          : { current_stage: Number(selectedStageId) };
        saved = await updateTracker(tracker.id, fields);
      } else if (isDayBasedCrop) {
        saved = await createTracker({ cropId: crop.id, plantingDate });
      } else {
        // A single atomic create with an explicit current_stage override,
        // rather than create-then-update -- that two-call split left a
        // window where a create could succeed but a following update call
        // fail, leaving an orphaned tracker row (unique_together) with no
        // way for the UI to recover short of a page reload. See Fix round 1.
        saved = await createTracker({ cropId: crop.id, currentStage: Number(selectedStageId) });
      }
      setTracker(saved);
      setShowTrackerForm(false);
    } catch (err) {
      const data = err.response?.data;
      if (data && typeof data === "object") {
        const firstField = Object.keys(data)[0];
        const message = Array.isArray(data[firstField]) ? data[firstField][0] : data[firstField];
        setTrackerError(message || t("crops.tracker.saveError"));
      } else {
        setTrackerError(t("crops.tracker.saveError"));
      }
    } finally {
      setTrackerSubmitting(false);
    }
  };

  // Task 6 -- same pre-fill-on-reopen idea as `openTrackerForm`, but run
  // automatically (there's no separate "open" step for the diary form:
  // it's always shown once a tracker exists) whenever the diary entries
  // we have change. Finds today's entry, if any, and loads it into the
  // form; otherwise resets to a blank entry for today.
  const applyDiaryPrefill = (entries) => {
    // The browser's LOCAL date, not UTC's (toISOString): for a farmer in
    // India, UTC is still "yesterday" until 05:30 IST. "en-CA" formats as
    // YYYY-MM-DD, matching the backend's entry_date (also IST-based).
    const todayISO = new Date().toLocaleDateString("en-CA");
    const todayEntry = entries.find((entry) => entry.entry_date === todayISO);
    if (todayEntry) {
      setDiaryForm({
        didIrrigation: !!todayEntry.did_irrigation,
        didFertilizer: !!todayEntry.did_fertilizer,
        didSpraying: !!todayEntry.did_spraying,
        didPruning: !!todayEntry.did_pruning,
        didOther: !!todayEntry.other_activity_note,
        otherActivityNote: todayEntry.other_activity_note || "",
        note: todayEntry.note || "",
        photoFile: null,
      });
    } else {
      setDiaryForm(emptyDiaryForm);
    }
  };

  const handleDiarySubmit = async (e) => {
    e.preventDefault();
    setDiaryError("");
    setDiarySubmitting(true);
    try {
      const saved = await saveDiaryEntry(tracker.id, {
        didIrrigation: diaryForm.didIrrigation,
        didFertilizer: diaryForm.didFertilizer,
        didSpraying: diaryForm.didSpraying,
        didPruning: diaryForm.didPruning,
        // The "other" text field is only meaningful while its checkbox is
        // ticked -- send "" rather than any stray leftover text if it's
        // unchecked, same as the backend's own "always send a string,
        // never omit" rule in api/diary.js.
        otherActivityNote: diaryForm.didOther ? diaryForm.otherActivityNote : "",
        note: diaryForm.note,
        photoFile: diaryForm.photoFile,
      });
      // Replace today's entry (there can be at most one per day --
      // unique_together("tracker", "entry_date")) rather than appending a
      // duplicate, then re-run the same pre-fill so the form reflects
      // exactly what the backend now has stored.
      const updatedEntries = [
        saved,
        ...diaryEntries.filter((entry) => entry.entry_date !== saved.entry_date),
      ];
      setDiaryEntries(updatedEntries);
      applyDiaryPrefill(updatedEntries);
    } catch (err) {
      const data = err.response?.data;
      if (data && typeof data === "object") {
        const firstField = Object.keys(data)[0];
        const message = Array.isArray(data[firstField]) ? data[firstField][0] : data[firstField];
        setDiaryError(message || t("crops.diary.saveError"));
      } else {
        setDiaryError(t("crops.diary.saveError"));
      }
    } finally {
      setDiarySubmitting(false);
    }
  };

  if (error) {
    return (
      <div className="dashboard-page">
        <AppHeader title={t("crops.title")} />
        <main className="app-main">
          <p className="form-error" role="alert">{error}</p>
          <Link to="/crops" className="auth-switch">{t("crops.backToCropList")}</Link>
        </main>
        <BottomNav />
      </div>
    );
  }

  if (!crop) {
    return <div className="loading-screen">{t("common.loading")}</div>;
  }

  const cropName = localizeField(crop, "name", i18n.language);

  return (
    <div className="dashboard-page">
      <AppHeader title={cropName} />

      <main className="app-main crop-detail-main">
        <div className="status-card status-ok">
          <p><strong>{t("crops.soilLabel")}:</strong> {localizeField(crop, "soil_type", i18n.language)}</p>
          <p><strong>{t("crops.climateLabel")}:</strong> {localizeField(crop, "climate", i18n.language)}</p>
          <p><strong>{t("crops.plantingMethodLabel")}:</strong> {localizeField(crop, "planting_method", i18n.language)}</p>
        </div>

        {crop.trackable_stages && crop.trackable_stages.length > 0 && (
          <section className="crop-section">
            <h2 className="crop-section-title">{t("crops.tracker.sectionTitle")}</h2>

            {!showTrackerForm && !tracker && (
              <button type="button" className="btn-primary" onClick={openTrackerForm}>
                {t("crops.tracker.trackButton")}
              </button>
            )}

            {!showTrackerForm && tracker && (
              <div className="status-card status-ok">
                <p>
                  <strong>{t("crops.tracker.currentStagePrefix")}</strong>{" "}
                  {tracker.current_stage?.name || t("crops.tracker.stageNotYetDetermined")}
                </p>
                <button type="button" className="btn-primary" onClick={openTrackerForm}>
                  {t("crops.tracker.updateButton")}
                </button>
              </div>
            )}

            {showTrackerForm && (
              <form onSubmit={handleTrackerSubmit} noValidate>
                {isDayBasedCrop ? (
                  <>
                    <label className="form-label" htmlFor="tracker_planting_date">
                      {t("crops.tracker.plantingDateLabel")}
                    </label>
                    <input
                      id="tracker_planting_date"
                      name="planting_date"
                      type="date"
                      className="form-input"
                      value={plantingDate}
                      onChange={(e) => setPlantingDate(e.target.value)}
                    />
                  </>
                ) : (
                  <>
                    <label className="form-label" htmlFor="tracker_stage">
                      {t("crops.tracker.stageLabel")}
                    </label>
                    <select
                      id="tracker_stage"
                      name="stage"
                      className="form-input"
                      value={selectedStageId}
                      onChange={(e) => setSelectedStageId(e.target.value)}
                    >
                      <option value="" disabled>{t("crops.tracker.stageLabel")}</option>
                      {crop.trackable_stages.map((stage) => (
                        <option key={stage.id} value={stage.id}>{stage.name}</option>
                      ))}
                    </select>
                  </>
                )}

                {trackerError && <p className="form-error" role="alert">{trackerError}</p>}

                <button type="submit" className="btn-primary" disabled={trackerSubmitting}>
                  {trackerSubmitting ? t("common.saving") : t("crops.tracker.submitButton")}
                </button>
                <button
                  type="button"
                  className="auth-switch"
                  onClick={() => { setShowTrackerForm(false); setTrackerError(""); }}
                >
                  {t("crops.tracker.cancelButton")}
                </button>
              </form>
            )}
          </section>
        )}

        {tracker && (
          <section className="crop-section">
            <h2 className="crop-section-title">{t("crops.diary.sectionTitle")}</h2>

            <form onSubmit={handleDiarySubmit} noValidate>
              <label className="form-checkbox-label">
                <input
                  type="checkbox"
                  checked={diaryForm.didIrrigation}
                  onChange={(e) =>
                    setDiaryForm((f) => ({ ...f, didIrrigation: e.target.checked }))
                  }
                />
                {t("crops.diary.irrigationLabel")}
              </label>
              <label className="form-checkbox-label">
                <input
                  type="checkbox"
                  checked={diaryForm.didFertilizer}
                  onChange={(e) =>
                    setDiaryForm((f) => ({ ...f, didFertilizer: e.target.checked }))
                  }
                />
                {t("crops.diary.fertilizerLabel")}
              </label>
              <label className="form-checkbox-label">
                <input
                  type="checkbox"
                  checked={diaryForm.didSpraying}
                  onChange={(e) =>
                    setDiaryForm((f) => ({ ...f, didSpraying: e.target.checked }))
                  }
                />
                {t("crops.diary.sprayingLabel")}
              </label>
              <label className="form-checkbox-label">
                <input
                  type="checkbox"
                  checked={diaryForm.didPruning}
                  onChange={(e) =>
                    setDiaryForm((f) => ({ ...f, didPruning: e.target.checked }))
                  }
                />
                {t("crops.diary.pruningLabel")}
              </label>

              <label className="form-checkbox-label">
                <input
                  type="checkbox"
                  checked={diaryForm.didOther}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setDiaryForm((f) => ({
                      ...f,
                      didOther: checked,
                      // Clearing the note on uncheck keeps the disabled
                      // field's displayed value in sync with what will
                      // actually be submitted (always "" while unchecked).
                      otherActivityNote: checked ? f.otherActivityNote : "",
                    }));
                  }}
                />
                {t("crops.diary.otherLabel")}
              </label>
              <input
                type="text"
                className="form-input"
                placeholder={t("crops.diary.otherNotePlaceholder")}
                value={diaryForm.otherActivityNote}
                disabled={!diaryForm.didOther}
                onChange={(e) =>
                  setDiaryForm((f) => ({ ...f, otherActivityNote: e.target.value }))
                }
              />

              <textarea
                className="form-input"
                placeholder={t("crops.diary.notePlaceholder")}
                value={diaryForm.note}
                onChange={(e) => setDiaryForm((f) => ({ ...f, note: e.target.value }))}
              />

              <label className="form-label" htmlFor="diary_photo">
                {t("crops.diary.photoLabel")}
              </label>
              <input
                id="diary_photo"
                name="photo"
                type="file"
                className="form-input"
                accept="image/jpeg,image/png"
                onChange={(e) =>
                  setDiaryForm((f) => ({ ...f, photoFile: e.target.files?.[0] || null }))
                }
              />

              {diaryError && <p className="form-error" role="alert">{diaryError}</p>}

              <button type="submit" className="btn-primary" disabled={diarySubmitting}>
                {diarySubmitting ? t("common.saving") : t("crops.diary.submitButton")}
              </button>
            </form>

            {/* Task 7 -- the read-only timeline of past entries. `diaryEntries`
                is already ordered most-recent-first by the backend
                (FarmingDiaryEntry.Meta.ordering = ["-entry_date"]), so this
                maps over it as-is with no client-side re-sort. */}
            <h3 className="crop-section-subtitle">{t("crops.diary.timelineTitle")}</h3>
            {diaryEntries.length === 0 ? (
              <p className="status-message">{t("crops.diary.noEntriesYet")}</p>
            ) : (
              <div className="diary-timeline">
                {diaryEntries.map((entry) => {
                  const activityLabels = [
                    entry.did_irrigation && t("crops.diary.irrigationLabel"),
                    entry.did_fertilizer && t("crops.diary.fertilizerLabel"),
                    entry.did_spraying && t("crops.diary.sprayingLabel"),
                    entry.did_pruning && t("crops.diary.pruningLabel"),
                    entry.other_activity_note,
                  ].filter(Boolean);

                  return (
                    <div key={entry.id} className="diary-entry-card">
                      <p className="diary-entry-date">{entry.entry_date}</p>
                      {activityLabels.length > 0 && (
                        <p className="diary-entry-activities">{activityLabels.join(", ")}</p>
                      )}
                      {entry.note && <p className="diary-entry-note">{entry.note}</p>}
                      {entry.photo && (
                        // Same photo-thumbnail convention as ScanHistoryPage.
                        <img src={entry.photo} alt="" className="scan-history-thumbnail" />
                      )}
                      {entry.photo_diagnosis_label && (
                        <p className="diary-entry-diagnosis">
                          {t("crops.diary.photoDiagnosisPrefix")} {entry.photo_diagnosis_label}
                        </p>
                      )}
                      {entry.ai_analysis_status === "ok" ? (
                        <p className="diary-entry-analysis">{entry.ai_analysis}</p>
                      ) : (
                        <p className="diary-entry-analysis diary-entry-analysis-unavailable">
                          {t("crops.diary.analysisUnavailable")}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        <Link to={`/videos?q=${encodeURIComponent(crop.name)}`} className="video-link-card">
          {t("crops.watchVideos", { name: cropName })}
        </Link>

        {crop.intercropped_with && crop.intercropped_with.length > 0 && (
          <section className="crop-section">
            <h2 className="crop-section-title">{t("crops.grownWithTitle")}</h2>
            <p>{t("crops.grownWithIntro", { name: cropName })}</p>
            <ul className="intercrop-list">
              {crop.intercropped_with.map((companion) => (
                <li key={companion.id}>
                  <Link to={`/crops/${companion.id}`}>{localizeField(companion, "name", i18n.language)}</Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {crop.lifecycle_stages.length > 0 && (
          <section className="crop-section">
            <h2 className="crop-section-title">{t("crops.lifecycleTitle")}</h2>
            <ol className="lifecycle-timeline">
              {crop.lifecycle_stages.map((stage, idx) => (
                <li key={idx} className="lifecycle-stage">
                  <span className="lifecycle-stage-name">{stage.stage}</span>
                  <span className="lifecycle-stage-duration">{stage.duration_description}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {crop.fertilizer_schedules.length > 0 && (
          <section className="crop-section">
            <h2 className="crop-section-title">{t("crops.fertilizerTitle")}</h2>
            {crop.fertilizer_schedules.map((sched, idx) => (
              <div key={idx} className="fertilizer-card">
                <p className="fertilizer-stage">{sched.growth_stage}</p>
                <p>🌿 {sched.fertilizer_guidance}</p>
                <p>💧 {sched.irrigation_guidance}</p>
              </div>
            ))}
          </section>
        )}

        {crop.organic_methods.length > 0 && (
          <section className="crop-section">
            <h2 className="crop-section-title">{t("crops.organicTitle")}</h2>
            {crop.organic_methods.map((method) => (
              <div key={method.id} className="fertilizer-card">
                <p className="fertilizer-stage">{method.name}</p>
                <p><strong>{t("crops.materialsLabel")}:</strong> {method.materials}</p>
                <p><strong>{t("crops.stepsLabel")}:</strong> {method.steps}</p>
              </div>
            ))}
          </section>
        )}

        <p className="auth-switch">
          <Link to="/crops">{t("crops.backToCropList")}</Link>
        </p>
      </main>
      <BottomNav />
    </div>
  );
}
