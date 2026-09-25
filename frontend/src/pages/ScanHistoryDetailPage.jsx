import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { fetchScanDetail } from "../api/scans";
import AppHeader from "../components/AppHeader";
import BottomNav from "../components/BottomNav";

export default function ScanHistoryDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const [scan, setScan] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setScan(null);
    setError("");
    fetchScanDetail(id)
      .then((data) => setScan(data))
      .catch((err) => {
        if (err.response?.status === 404 || err.response?.status === 403) {
          // A 403 here (IsScanOwner) reads the same as "not found" to the
          // farmer -- we never confirm or deny that some OTHER user's scan
          // ID exists, that would itself be a minor information leak.
          setError(t("scan.notFound"));
        } else {
          setError(t("scan.loadError"));
        }
      });
  }, [id, t]);

  if (error) {
    return (
      <div className="dashboard-page">
        <AppHeader icon="📜" title={t("scan.resultTitle")} />
        <main className="app-main">
          <p className="form-error" role="alert">{error}</p>
          <Link to="/scan/history" className="auth-switch">{t("scan.backToHistory")}</Link>
        </main>
        <BottomNav />
      </div>
    );
  }

  if (!scan) {
    return <div className="loading-screen">{t("scan.detailLoading")}</div>;
  }

  return (
    <div className="dashboard-page">
      <AppHeader icon="📜" title={t("scan.resultTitle")} />

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
        </div>

        <p className="auth-switch">
          <Link to="/scan/history">{t("scan.backToHistory")}</Link>
        </p>
      </main>
      <BottomNav />
    </div>
  );
}
