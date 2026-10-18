import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { fetchCropDetail } from "../api/crops";
import { fetchTrackers, createTracker, updateTracker } from "../api/cropTracker";
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
