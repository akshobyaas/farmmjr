import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useScanDetail } from "../hooks/useScanDetail";
import AppHeader from "../components/AppHeader";
import BottomNav from "../components/BottomNav";
import LowConfidenceNudge from "../components/LowConfidenceNudge";
import PageSkeleton from "../components/PageSkeleton";

export default function ScanHistoryDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const { scan, error } = useScanDetail(id);

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
                <p className="scan-confidence">
                  {t("scan.confidence", { pct: (scan.confidence * 100).toFixed(1) })}
                </p>
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
        </div>

        <p className="auth-switch">
          <Link to="/scan/history">{t("scan.backToHistory")}</Link>
        </p>
      </main>
      <BottomNav />
    </div>
  );
}
