import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useScanDetail } from "../hooks/useScanDetail";
import AppHeader from "../components/AppHeader";
import BottomNav from "../components/BottomNav";
import LowConfidenceNudge from "../components/LowConfidenceNudge";
import PageSkeleton from "../components/PageSkeleton";
import styles from "./ScanHistoryDetailPage.module.css";

// Same formatting ScanHistoryPage.jsx's list already uses -- kept local
// to each page rather than factored out, matching that existing pattern.
function formatDate(isoString) {
  return new Date(isoString).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function ScanHistoryDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const { scan, error, activeTracker, diarySaveStatus, handleSaveToDiary } = useScanDetail(id);

  if (error) {
    return (
      <div className="dashboard-page">
        <AppHeader title={t("scan.resultTitle")} />
        <main className="app-main">
          <p className="form-error" role="alert">{error}</p>
          <Link to="/scan/history" className="auth-switch">{t("scan.backToHistory")}</Link>
        </main>
        <BottomNav />
      </div>
    );
  }

  if (!scan) {
    return <PageSkeleton label={t("scan.detailLoading")} />;
  }

  return (
    <div className="dashboard-page">
      <AppHeader title={t("scan.resultTitle")} />

      <main className="app-main">
        <div className="status-card status-ok">
          {scan.image && (
            <img src={scan.image} alt="Scanned crop" className="scan-preview-image" />
          )}

          {scan.predicted_disease ? (
            <div className="scan-result-details">
              <h2 className="crop-section-title">
                {scan.predicted_disease.name}
                {scan.predicted_disease.crop_name && ` — ${scan.predicted_disease.crop_name}`}
              </h2>
              {typeof scan.confidence === "number" && (
                /* UI Redesign -- confidence sits in a stat-tile-value (shared.css),
                   following WeatherPage's meta row: the fully-interpolated
                   translation string stays one value, so en/hi/kn copy is unchanged. */
                <div className={styles["scan-meta"]}>
                  <span className="stat-tile-value">
                    {t("scan.confidence", { pct: (scan.confidence * 100).toFixed(1) })}
                  </span>
                </div>
              )}
              {scan.predicted_disease.symptoms && (
                <p><strong>{t("scan.symptomsLabel")}:</strong> {scan.predicted_disease.symptoms}</p>
              )}
              {scan.predicted_disease.prevention && (
                <p><strong>{t("scan.preventionLabel")}:</strong> {scan.predicted_disease.prevention}</p>
              )}
              {scan.predicted_disease.treatment_info && (
                <p><strong>{t("scan.treatmentLabel")}:</strong> {scan.predicted_disease.treatment_info}</p>
              )}
            </div>
          ) : (
            <p className="status-message">{t("scan.predictionUnavailableDetail")}</p>
          )}

          <LowConfidenceNudge scan={scan} />

          {activeTracker && (
            <div style={{ marginTop: 16 }}>
              {diarySaveStatus === "saved" ? (
                <p className="status-message">
                  {t("scan.savedToDiaryWithDate", { date: formatDate(scan.created_at) })}
                </p>
              ) : (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleSaveToDiary}
                  disabled={diarySaveStatus === "saving"}
                >
                  {diarySaveStatus === "saving" ? t("scan.savingToDiary") : t("scan.saveToDiaryButton")}
                </button>
              )}
              {diarySaveStatus === "error" && (
                <p className="form-error" role="alert">{t("scan.saveToDiaryError")}</p>
              )}
            </div>
          )}
        </div>

        <p className="auth-switch">
          <Link to="/scan/history">{t("scan.backToHistory")}</Link>
        </p>
      </main>
      <BottomNav />
    </div>
  );
}
