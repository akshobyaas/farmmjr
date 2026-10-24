import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { fetchCropDetail } from "../api/crops";
import { localizeField } from "../i18n/localize";
import AppHeader from "../components/AppHeader";
import BottomNav from "../components/BottomNav";
import { useCropTracker } from "../hooks/useCropTracker";
import { useDiaryEntries } from "../hooks/useDiaryEntries";
import styles from "./CropDetailPage.module.css";

export default function CropDetailPage() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const [crop, setCrop] = useState(null);
  const [error, setError] = useState("");

  const {
    tracker,
    showTrackerForm,
    plantingDate,
    setPlantingDate,
    selectedStageId,
    setSelectedStageId,
    trackerSubmitting,
    trackerError,
    openTrackerForm,
    closeTrackerForm,
    handleTrackerSubmit: submitTracker,
  } = useCropTracker(id);

  const {
    diaryEntries,
    diaryForm,
    setDiaryForm,
    diarySubmitting,
    diaryError,
    handleDiarySubmit,
  } = useDiaryEntries(tracker);

  useEffect(() => {
    setCrop(null);
    setError("");

    fetchCropDetail(id)
      .then((data) => setCrop(data))
      .catch((err) => {
        if (err.response?.status === 404) {
          setError(t("crops.cropNotFound"));
        } else {
          setError(t("crops.cropLoadError"));
        }
      });
  }, [id, t]);

  const isDayBasedCrop = (crop?.trackable_stages || []).some(
    (stage) => stage.day_range_start != null
  );

  const handleTrackerSubmit = (e) => submitTracker(e, { isDayBasedCrop, crop });

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

      <main className={`app-main ${styles["crop-detail-main"]}`}>
        <div className="status-card status-ok">
          <p><strong>{t("crops.soilLabel")}:</strong> {localizeField(crop, "soil_type", i18n.language)}</p>
          <p><strong>{t("crops.climateLabel")}:</strong> {localizeField(crop, "climate", i18n.language)}</p>
          <p><strong>{t("crops.plantingMethodLabel")}:</strong> {localizeField(crop, "planting_method", i18n.language)}</p>
        </div>

        {crop.trackable_stages && crop.trackable_stages.length > 0 && (
          <section className={styles["crop-section"]}>
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
                  onClick={closeTrackerForm}
                >
                  {t("crops.tracker.cancelButton")}
                </button>
              </form>
            )}
          </section>
        )}

        {tracker && (
          <section className={styles["crop-section"]}>
            <h2 className="crop-section-title">{t("crops.diary.sectionTitle")}</h2>

            <form onSubmit={handleDiarySubmit} noValidate>
              <label className={styles["form-checkbox-label"]}>
                <input
                  type="checkbox"
                  checked={diaryForm.didIrrigation}
                  onChange={(e) =>
                    setDiaryForm((f) => ({ ...f, didIrrigation: e.target.checked }))
                  }
                />
                {t("crops.diary.irrigationLabel")}
              </label>
              <label className={styles["form-checkbox-label"]}>
                <input
                  type="checkbox"
                  checked={diaryForm.didFertilizer}
                  onChange={(e) =>
                    setDiaryForm((f) => ({ ...f, didFertilizer: e.target.checked }))
                  }
                />
                {t("crops.diary.fertilizerLabel")}
              </label>
              <label className={styles["form-checkbox-label"]}>
                <input
                  type="checkbox"
                  checked={diaryForm.didSpraying}
                  onChange={(e) =>
                    setDiaryForm((f) => ({ ...f, didSpraying: e.target.checked }))
                  }
                />
                {t("crops.diary.sprayingLabel")}
              </label>
              <label className={styles["form-checkbox-label"]}>
                <input
                  type="checkbox"
                  checked={diaryForm.didPruning}
                  onChange={(e) =>
                    setDiaryForm((f) => ({ ...f, didPruning: e.target.checked }))
                  }
                />
                {t("crops.diary.pruningLabel")}
              </label>

              <label className={styles["form-checkbox-label"]}>
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
            <h3 className={styles["crop-section-subtitle"]}>{t("crops.diary.timelineTitle")}</h3>
            {diaryEntries.length === 0 ? (
              <p className="status-message">{t("crops.diary.noEntriesYet")}</p>
            ) : (
              <div className={styles["diary-timeline"]}>
                {diaryEntries.map((entry) => {
                  const activityLabels = [
                    entry.did_irrigation && t("crops.diary.irrigationLabel"),
                    entry.did_fertilizer && t("crops.diary.fertilizerLabel"),
                    entry.did_spraying && t("crops.diary.sprayingLabel"),
                    entry.did_pruning && t("crops.diary.pruningLabel"),
                    entry.other_activity_note,
                  ].filter(Boolean);

                  return (
                    <div key={entry.id} className={styles["diary-entry-card"]}>
                      <p className={styles["diary-entry-date"]}>{entry.entry_date}</p>
                      {activityLabels.length > 0 && (
                        <p className={styles["diary-entry-activities"]}>{activityLabels.join(", ")}</p>
                      )}
                      {entry.note && <p className={styles["diary-entry-note"]}>{entry.note}</p>}
                      {entry.photo && (
                        // Same photo-thumbnail convention as ScanHistoryPage.
                        <img src={entry.photo} alt="" className="scan-history-thumbnail" />
                      )}
                      {entry.photo_diagnosis_label && (
                        <p className={styles["diary-entry-diagnosis"]}>
                          {t("crops.diary.photoDiagnosisPrefix")} {entry.photo_diagnosis_label}
                        </p>
                      )}
                      {entry.ai_analysis_status === "ok" ? (
                        <p className={styles["diary-entry-analysis"]}>{entry.ai_analysis}</p>
                      ) : (
                        <p className={`${styles["diary-entry-analysis"]} ${styles["diary-entry-analysis-unavailable"]}`}>
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

        <Link to={`/videos?q=${encodeURIComponent(crop.name)}`} className={styles["video-link-card"]}>
          {t("crops.watchVideos", { name: cropName })}
        </Link>

        {crop.intercropped_with && crop.intercropped_with.length > 0 && (
          <section className={styles["crop-section"]}>
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
          <section className={styles["crop-section"]}>
            <h2 className="crop-section-title">{t("crops.lifecycleTitle")}</h2>
            <ol className={styles["lifecycle-timeline"]}>
              {crop.lifecycle_stages.map((stage, idx) => (
                <li key={idx} className={styles["lifecycle-stage"]}>
                  <span className={styles["lifecycle-stage-name"]}>{stage.stage}</span>
                  <span className={styles["lifecycle-stage-duration"]}>{stage.duration_description}</span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {crop.fertilizer_schedules.length > 0 && (
          <section className={styles["crop-section"]}>
            <h2 className="crop-section-title">{t("crops.fertilizerTitle")}</h2>
            {crop.fertilizer_schedules.map((sched, idx) => (
              <div key={idx} className={styles["fertilizer-card"]}>
                <p className={styles["fertilizer-stage"]}>{sched.growth_stage}</p>
                <p>🌿 {sched.fertilizer_guidance}</p>
                <p>💧 {sched.irrigation_guidance}</p>
              </div>
            ))}
          </section>
        )}

        {crop.organic_methods.length > 0 && (
          <section className={styles["crop-section"]}>
            <h2 className="crop-section-title">{t("crops.organicTitle")}</h2>
            {crop.organic_methods.map((method) => (
              <div key={method.id} className={styles["fertilizer-card"]}>
                <p className={styles["fertilizer-stage"]}>{method.name}</p>
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
