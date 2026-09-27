import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { fetchCropDetail } from "../api/crops";
import { localizeField } from "../i18n/localize";
import AppHeader from "../components/AppHeader";
import Icon from "../components/Icon";
import BottomNav from "../components/BottomNav";

export default function CropDetailPage() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const [crop, setCrop] = useState(null);
  const [error, setError] = useState("");

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

  if (error) {
    return (
      <div className="dashboard-page">
        <AppHeader icon={<Icon name="leaf" />} title={t("crops.title")} />
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
      <AppHeader icon={<Icon name="leaf" />} title={cropName} />

      <main className="app-main crop-detail-main">
        <div className="status-card status-ok">
          <p><strong>{t("crops.soilLabel")}:</strong> {localizeField(crop, "soil_type", i18n.language)}</p>
          <p><strong>{t("crops.climateLabel")}:</strong> {localizeField(crop, "climate", i18n.language)}</p>
          <p><strong>{t("crops.plantingMethodLabel")}:</strong> {localizeField(crop, "planting_method", i18n.language)}</p>
        </div>

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
