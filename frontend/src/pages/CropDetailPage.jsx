import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { fetchCropDetail } from "../api/crops";
import { fetchScanHistory } from "../api/scans";
import { localizeField } from "../i18n/localize";
import AppHeader from "../components/AppHeader";
import BottomNav from "../components/BottomNav";
import PageSkeleton from "../components/PageSkeleton";
import Icon from "../components/Icon";
import { useCropTracker } from "../hooks/useCropTracker";
import { useDiaryEntries, getDiaryFieldVisibility } from "../hooks/useDiaryEntries";
import styles from "./CropDetailPage.module.css";

// Same short-date convention as ScanHistoryPage's own formatDate -- kept
// as a separate copy here rather than a shared import since it's a tiny,
// presentation-only helper (not worth a new shared module for one line).
function formatScanDate(isoString) {
  return new Date(isoString).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function CropDetailPage() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const [crop, setCrop] = useState(null);
  const [error, setError] = useState("");
  // Task 12 -- "Recent scans for this crop" mini-list. Fetched independently
  // of the main crop-detail load (keyed only on `id`, not on `crop` or
  // `error`) since it's a separate, non-blocking summary section: a scan
  // fetch failure here just leaves the mini-list empty/hidden rather than
  // surfacing another error banner on top of the page's main one.
  const [recentScans, setRecentScans] = useState([]);

  useEffect(() => {
    setRecentScans([]);
    fetchScanHistory(1, id)
      .then((data) => setRecentScans(data?.results || []))
      .catch(() => setRecentScans([]));
  }, [id]);

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

  // Task 11 -- Dynamic Diary Fields (spec 7.3): which of Task 10's six
  // optional fields to show, given which activity checkboxes are
  // currently ticked. See useDiaryEntries.js's getDiaryFieldVisibility
  // for the did_*-to-field mapping and why "treatment"/"harvest" land on
  // did_spraying/did_pruning.
  const diaryFieldVisibility = getDiaryFieldVisibility(diaryForm);

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
    return <PageSkeleton label={t("common.loading")} />;
  }

  const cropName = localizeField(crop, "name", i18n.language);

  return (
    <div className="dashboard-page">
      <AppHeader title={cropName} />

      <main className={`app-main ${styles["crop-detail-main"]}`}>
        {/* Crop Detail page redesign -- a grouped icon-row list (same shape
            as Weather's daily-list rows) in place of the previous plain
            bold-label paragraph stack, so each fact reads at a glance. */}
        <div className={styles["crop-info-card"]}>
          <div className={styles["crop-info-row"]}>
            <span className={styles["crop-info-icon"]} aria-hidden="true">
              <Icon name="landscape" size={20} />
            </span>
            <span className={styles["crop-info-text"]}>
              <span className={styles["crop-info-label"]}>{t("crops.soilLabel")}</span>
              <span className={styles["crop-info-value"]}>{localizeField(crop, "soil_type", i18n.language)}</span>
            </span>
          </div>
          <div className={styles["crop-info-row"]}>
            <span className={styles["crop-info-icon"]} aria-hidden="true">
              <Icon name="cloudSun" size={20} />
            </span>
            <span className={styles["crop-info-text"]}>
              <span className={styles["crop-info-label"]}>{t("crops.climateLabel")}</span>
              <span className={styles["crop-info-value"]}>{localizeField(crop, "climate", i18n.language)}</span>
            </span>
          </div>
          <div className={styles["crop-info-row"]}>
            <span className={styles["crop-info-icon"]} aria-hidden="true">
              <Icon name="leaf" size={20} />
            </span>
            <span className={styles["crop-info-text"]}>
              <span className={styles["crop-info-label"]}>{t("crops.plantingMethodLabel")}</span>
              <span className={styles["crop-info-value"]}>{localizeField(crop, "planting_method", i18n.language)}</span>
            </span>
          </div>
        </div>

        {/* Task 12 -- "Recent scans for this crop", reusing the shared
            .list-row pattern (same as ScanHistoryPage/diary timelines)
            for each item. Hidden entirely when there are no scans yet,
            same "don't show an empty summary section" choice as
            Grown With / lifecycle / fertilizer / organic below. */}
        {recentScans.length > 0 && (
          <section className={styles["crop-section"]}>
            <h2 className="crop-section-title">{t("crops.recentScans.sectionTitle")}</h2>
            <div className={styles["recent-scans-list"]}>
              {recentScans.slice(0, 3).map((scan) => (
                <Link key={scan.id} to={`/scan/history/${scan.id}`} className="list-row">
                  <span className="list-row-icon" aria-hidden="true">
                    {scan.image ? (
                      <img src={scan.image} alt="" />
                    ) : (
                      <Icon name="search" size={20} />
                    )}
                  </span>
                  <span className="list-row-text">
                    <span className="list-row-title">
                      {scan.disease_name || t("scan.predictionUnavailable")}
                    </span>
                    <span className="list-row-subtitle">{formatScanDate(scan.created_at)}</span>
                  </span>
                  <span className="list-row-chevron" aria-hidden="true">
                    <Icon name="chevronRight" size={18} />
                  </span>
                </Link>
              ))}
            </div>
            {/* Link target is a query param on the EXISTING /scan/history
                route (Task 12), not a new route. */}
            <Link to={`/scan/history?crop=${id}`} className="auth-switch">
              {t("crops.recentScans.viewAllLink")}
            </Link>
          </section>
        )}

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
                <div className="stat-tile">
                  <span className="stat-tile-label">{t("crops.tracker.currentStagePrefix")}</span>
                  <span className="stat-tile-value">
                    {tracker.current_stage?.name || t("crops.tracker.stageNotYetDetermined")}
                  </span>
                </div>
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

            <form onSubmit={handleDiarySubmit} noValidate className={styles["diary-form-card"]}>
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

              {/* Task 11 -- Dynamic Diary Fields (spec 7.3). Each group is
                  rendered at most once even though some fields are shared
                  across more than one checked activity type (see
                  getDiaryFieldVisibility) -- e.g. ticking both Irrigation
                  and Fertilizer shows one Quantity/Unit pair, not two. */}
              {(diaryFieldVisibility.showDuration ||
                diaryFieldVisibility.showQuantity ||
                diaryFieldVisibility.showProductName ||
                diaryFieldVisibility.showCost ||
                diaryFieldVisibility.showHarvestNote) && (
                <div className={styles["diary-dynamic-fields"]}>
                  {diaryFieldVisibility.showDuration && (
                    <div className="field-box">
                      <label className="field-box-label" htmlFor="diary_duration_minutes">
                        {t("crops.diary.durationMinutesLabel")}
                      </label>
                      <input
                        id="diary_duration_minutes"
                        type="number"
                        min="0"
                        className="field-box-input"
                        value={diaryForm.durationMinutes}
                        onChange={(e) =>
                          setDiaryForm((f) => ({ ...f, durationMinutes: e.target.value }))
                        }
                      />
                    </div>
                  )}
                  {diaryFieldVisibility.showQuantity && (
                    <div className="field-box">
                      <label className="field-box-label" htmlFor="diary_quantity">
                        {t("crops.diary.quantityLabel")}
                      </label>
                      <input
                        id="diary_quantity"
                        type="number"
                        min="0"
                        step="0.01"
                        className="field-box-input"
                        value={diaryForm.quantity}
                        onChange={(e) =>
                          setDiaryForm((f) => ({ ...f, quantity: e.target.value }))
                        }
                      />
                    </div>
                  )}
                  {diaryFieldVisibility.showQuantity && (
                    <div className="field-box">
                      <label className="field-box-label" htmlFor="diary_quantity_unit">
                        {t("crops.diary.quantityUnitLabel")}
                      </label>
                      <input
                        id="diary_quantity_unit"
                        type="text"
                        className="field-box-input"
                        placeholder={t("crops.diary.quantityUnitPlaceholder")}
                        value={diaryForm.quantityUnit}
                        onChange={(e) =>
                          setDiaryForm((f) => ({ ...f, quantityUnit: e.target.value }))
                        }
                      />
                    </div>
                  )}
                  {diaryFieldVisibility.showProductName && (
                    <div className="field-box">
                      <label className="field-box-label" htmlFor="diary_product_name">
                        {t("crops.diary.productNameLabel")}
                      </label>
                      <input
                        id="diary_product_name"
                        type="text"
                        className="field-box-input"
                        value={diaryForm.productName}
                        onChange={(e) =>
                          setDiaryForm((f) => ({ ...f, productName: e.target.value }))
                        }
                      />
                    </div>
                  )}
                  {diaryFieldVisibility.showCost && (
                    <div className="field-box">
                      <label className="field-box-label" htmlFor="diary_cost_amount">
                        {t("crops.diary.costAmountLabel")}
                      </label>
                      <input
                        id="diary_cost_amount"
                        type="number"
                        min="0"
                        step="0.01"
                        className="field-box-input"
                        value={diaryForm.costAmount}
                        onChange={(e) =>
                          setDiaryForm((f) => ({ ...f, costAmount: e.target.value }))
                        }
                      />
                    </div>
                  )}
                  {diaryFieldVisibility.showHarvestNote && (
                    <div className="field-box">
                      <label className="field-box-label" htmlFor="diary_harvest_quality_note">
                        {t("crops.diary.harvestQualityNoteLabel")}
                      </label>
                      <input
                        id="diary_harvest_quality_note"
                        type="text"
                        className="field-box-input"
                        value={diaryForm.harvestQualityNote}
                        onChange={(e) =>
                          setDiaryForm((f) => ({ ...f, harvestQualityNote: e.target.value }))
                        }
                      />
                    </div>
                  )}
                </div>
              )}

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
              <div className="field-box">
                <label className="field-box-label" htmlFor="diary_other_note">
                  {t("crops.diary.otherNotePlaceholder")}
                </label>
                <input
                  id="diary_other_note"
                  type="text"
                  className="field-box-input"
                  value={diaryForm.otherActivityNote}
                  disabled={!diaryForm.didOther}
                  onChange={(e) =>
                    setDiaryForm((f) => ({ ...f, otherActivityNote: e.target.value }))
                  }
                />
              </div>

              <div className="field-box">
                <label className="field-box-label" htmlFor="diary_note">
                  {t("crops.diary.notePlaceholder")}
                </label>
                <textarea
                  id="diary_note"
                  className={`field-box-input ${styles["diary-note-textarea"]}`}
                  value={diaryForm.note}
                  onChange={(e) => setDiaryForm((f) => ({ ...f, note: e.target.value }))}
                />
              </div>

              <label className="form-label" htmlFor="diary_photo">
                {t("crops.diary.photoLabel")}
              </label>
              <label htmlFor="diary_photo" className={`btn-secondary ${styles["diary-photo-trigger"]}`}>
                <Icon name="imageSearch" size={18} />
                <span className={styles["diary-photo-trigger-text"]}>
                  {diaryForm.photoFile ? diaryForm.photoFile.name : t("crops.diary.choosePhoto")}
                </span>
              </label>
              <input
                id="diary_photo"
                name="photo"
                type="file"
                className={styles["diary-photo-input"]}
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

                  // Final-review fix (F8) -- Task 10's six optional detail
                  // fields were captured by the diary form (see the
                  // "Dynamic diary fields" group above) but never rendered
                  // back once an entry became part of this historical
                  // timeline, so a farmer's logged quantity/cost/duration/
                  // product name/harvest-quality note silently vanished
                  // from the UI after midnight even though it was saved.
                  // Each is shown only when actually present on the entry,
                  // same "label: value" convention as the photo-diagnosis
                  // line below, reusing its styling.
                  const detailLines = [
                    entry.duration_minutes != null &&
                      `${t("crops.diary.durationMinutesLabel")}: ${entry.duration_minutes}`,
                    entry.quantity != null &&
                      `${t("crops.diary.quantityLabel")}: ${entry.quantity}${
                        entry.quantity_unit ? ` ${entry.quantity_unit}` : ""
                      }`,
                    entry.product_name &&
                      `${t("crops.diary.productNameLabel")}: ${entry.product_name}`,
                    entry.cost_amount != null &&
                      `${t("crops.diary.costAmountLabel")}: ${entry.cost_amount}`,
                    entry.harvest_quality_note &&
                      `${t("crops.diary.harvestQualityNoteLabel")}: ${entry.harvest_quality_note}`,
                  ].filter(Boolean);

                  return (
                    <div key={entry.id} className={styles["diary-entry-card"]}>
                      <p className={styles["diary-entry-date"]}>{entry.entry_date}</p>
                      {activityLabels.length > 0 && (
                        <div className={styles["diary-entry-activities"]}>
                          {activityLabels.map((label, i) => (
                            <span key={i} className="chip">{label}</span>
                          ))}
                        </div>
                      )}
                      {detailLines.map((line, i) => (
                        <p key={`detail-${i}`} className={styles["diary-entry-diagnosis"]}>
                          {line}
                        </p>
                      ))}
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

        {/* Task 18 -- entry point to the new Crop Health page. Same
            .video-link-card shape as the "watch videos" link just below,
            reused as-is rather than inventing a new link-card style. */}
        <Link to={`/crops/${id}/health`} className={styles["video-link-card"]}>
          <span className={styles["video-link-icon"]} aria-hidden="true">
            <Icon name="eye" size={18} />
          </span>
          <span>{t("crops.cropHealthLink")}</span>
        </Link>

        {/* Icon badge in place of the previous baked-in ▶️ emoji -- see the
            i18n locale files, where that prefix was stripped. */}
        <Link to={`/videos?q=${encodeURIComponent(crop.name)}`} className={styles["video-link-card"]}>
          <span className={styles["video-link-icon"]} aria-hidden="true">
            <Icon name="play" size={18} />
          </span>
          <span>{t("crops.watchVideos", { name: cropName })}</span>
        </Link>

        {crop.intercropped_with && crop.intercropped_with.length > 0 && (
          <section className={styles["crop-section"]}>
            <h2 className="crop-section-title">{t("crops.grownWithTitle")}</h2>
            <p>{t("crops.grownWithIntro", { name: cropName })}</p>
            {/* Green pill chips in place of the previous plain bulleted
                list -- same chip language as Weather's recent-searches
                row. */}
            <div className={styles["grown-with-chips"]}>
              {crop.intercropped_with.map((companion) => (
                <Link
                  key={companion.id}
                  to={`/crops/${companion.id}`}
                  className={styles["grown-with-chip"]}
                >
                  <Icon name="leaf" size={14} />
                  {localizeField(companion, "name", i18n.language)}
                </Link>
              ))}
            </div>
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
            {/* Icon rows in place of the previous 🌿/💧 emoji-prefixed
                sentences, same icon-row language as the crop-info card
                above. */}
            {crop.fertilizer_schedules.map((sched, idx) => (
              <div key={idx} className={styles["fertilizer-card"]}>
                <p className={styles["fertilizer-stage"]}>{sched.growth_stage}</p>
                <div className={styles["fertilizer-row"]}>
                  <Icon name="eco" size={18} className={styles["fertilizer-row-icon"]} />
                  <span>{sched.fertilizer_guidance}</span>
                </div>
                <div className={styles["fertilizer-row"]}>
                  <Icon name="waterDrop" size={18} className={styles["fertilizer-row-icon"]} />
                  <span>{sched.irrigation_guidance}</span>
                </div>
              </div>
            ))}
          </section>
        )}

        {crop.organic_methods.length > 0 && (
          <section className={styles["crop-section"]}>
            <h2 className="crop-section-title">{t("crops.organicTitle")}</h2>
            {/* Structured label/value rows in place of the previous single
                inline-bold sentence, easier to scan. */}
            {crop.organic_methods.map((method) => (
              <div key={method.id} className={styles["fertilizer-card"]}>
                <p className={styles["fertilizer-stage"]}>{method.name}</p>
                <div className={styles["organic-field"]}>
                  <span className={styles["organic-field-label"]}>{t("crops.materialsLabel")}</span>
                  <span className={styles["organic-field-value"]}>{method.materials}</span>
                </div>
                <div className={styles["organic-field"]}>
                  <span className={styles["organic-field-label"]}>{t("crops.stepsLabel")}</span>
                  <span className={styles["organic-field-value"]}>{method.steps}</span>
                </div>
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
