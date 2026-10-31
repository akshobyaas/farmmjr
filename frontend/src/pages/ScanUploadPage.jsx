import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useScanUpload } from "../hooks/useScanUpload";
import AppHeader from "../components/AppHeader";
import BottomNav from "../components/BottomNav";
import LowConfidenceNudge from "../components/LowConfidenceNudge";
import styles from "./ScanUploadPage.module.css";

export default function ScanUploadPage() {
  const { t } = useTranslation();
  const { file, previewUrl, error, result, submitting, handleFileChange, handleSubmit, handleScanAnother } =
    useScanUpload();

  return (
    <div className="dashboard-page">
      <AppHeader title={t("scan.uploadTitle")} />

      <main className="app-main">
        {!result && (
          <form onSubmit={handleSubmit} className={styles["scan-upload-form"]} noValidate>
            <label htmlFor="scan-image" className={styles["scan-upload-dropzone"]}>
              {previewUrl ? (
                <img src={previewUrl} alt="Selected crop preview" className="scan-preview-image" />
              ) : (
                <span className={styles["scan-upload-placeholder"]}>
                  {t("scan.tapToChoose")}
                </span>
              )}
            </label>
            <input
              id="scan-image"
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className={styles["scan-upload-input"]}
            />

            {/* Direct camera capture, separate from the dropzone above.
                capture="environment" skips the OS's "choose source" sheet
                and opens the back camera straight away -- a farmer in the
                field wants to snap a photo now, not pick through a generic
                file chooser. Feeds the same handleFileChange as the
                gallery input above, so preview/validation/upload are
                unchanged. */}
            <label htmlFor="scan-image-camera" className={`btn-secondary ${styles["scan-upload-camera-btn"]}`}>
              {t("scan.takePhoto")}
            </label>
            <input
              id="scan-image-camera"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
              className={styles["scan-upload-input"]}
            />

            {error && <p className="form-error" role="alert">{error}</p>}

            <button type="submit" className="btn-primary" disabled={submitting || !file}>
              {submitting ? t("scan.uploading") : t("scan.uploadButton")}
            </button>
          </form>
        )}

        {result && (
          <div className="status-card status-ok">
            <p className="status-title">{t("scan.uploadedTitle")}</p>
            {result.scan?.image && (
              <img src={result.scan.image} alt="Uploaded crop scan" className="scan-preview-image" />
            )}
            <p className="status-message">{result.message}</p>

            {result.scan?.predicted_disease && (
              <div className="scan-result-details">
                <h2 className="crop-section-title">
                  {result.scan.predicted_disease.name}
                  {result.scan.predicted_disease.crop_name && ` — ${result.scan.predicted_disease.crop_name}`}
                </h2>
                {typeof result.scan.confidence === "number" && (
                  <p className="scan-confidence">
                    {t("scan.confidence", { pct: (result.scan.confidence * 100).toFixed(1) })}
                  </p>
                )}
                {result.scan.predicted_disease.symptoms && (
                  <p><strong>{t("scan.symptomsLabel")}:</strong> {result.scan.predicted_disease.symptoms}</p>
                )}
                {result.scan.predicted_disease.prevention && (
                  <p><strong>{t("scan.preventionLabel")}:</strong> {result.scan.predicted_disease.prevention}</p>
                )}
                {result.scan.predicted_disease.treatment_info && (
                  <p><strong>{t("scan.treatmentLabel")}:</strong> {result.scan.predicted_disease.treatment_info}</p>
                )}
              </div>
            )}

            <LowConfidenceNudge scan={result.scan} />

            <button type="button" className="btn-secondary" onClick={handleScanAnother} style={{ marginTop: 16 }}>
              {t("scan.scanAnotherButton")}
            </button>
          </div>
        )}

        <p className="auth-switch">
          <Link to="/dashboard">{t("common.backToDashboard")}</Link>
        </p>
      </main>
      <BottomNav />
    </div>
  );
}
