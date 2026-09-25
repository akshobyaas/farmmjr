import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { uploadScan } from "../api/scans";

// Server-side validation (scans/serializers.py) enforces the real limits;
// this is just a fast, friendly client-side check so a farmer doesn't wait
// on a slow mobile upload just to be told the file was too big.
const MAX_PREVIEW_SIZE_BYTES = 5 * 1024 * 1024;

export default function ScanUploadPage() {
  const [file, setFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const objectUrlRef = useRef(null);

  // Revoke the previous object URL whenever we replace it or unmount, so we
  // don't leak memory across repeated selections.
  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  const handleFileChange = (e) => {
    setError("");
    setResult(null);
    const selected = e.target.files?.[0];
    if (!selected) {
      setFile(null);
      setPreviewUrl(null);
      return;
    }

    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);

    if (selected.size > MAX_PREVIEW_SIZE_BYTES) {
      setError("Image too large. Maximum size is 5MB.");
      setFile(null);
      setPreviewUrl(null);
      return;
    }

    const url = URL.createObjectURL(selected);
    objectUrlRef.current = url;
    setFile(selected);
    setPreviewUrl(url);
  };

  const extractErrorMessage = (err) => {
    if (!err.response) {
      return "Could not reach the server. Check your connection and try again.";
    }
    if (err.response.status === 401) {
      return "Your session has expired. Please log in again.";
    }
    if (err.response.status === 429) {
      return "Too many uploads. Please wait a minute and try again.";
    }
    const imageError = err.response.data?.image;
    if (Array.isArray(imageError) && imageError.length > 0) {
      return imageError[0];
    }
    if (typeof imageError === "string") {
      return imageError;
    }
    return "Could not upload the image. Please try again.";
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      setError("Please choose a photo of the crop first.");
      return;
    }
    setError("");
    setResult(null);
    setSubmitting(true);
    try {
      const data = await uploadScan(file);
      setResult(data);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleScanAnother = () => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
    setFile(null);
    setPreviewUrl(null);
    setResult(null);
    setError("");
  };

  return (
    <div className="dashboard-page">
      <header className="app-header">
        <span className="app-header-icon">🔍</span>
        <h1>Scan a Crop</h1>
      </header>

      <main className="app-main">
        {!result && (
          <form onSubmit={handleSubmit} className="scan-upload-form" noValidate>
            <label htmlFor="scan-image" className="scan-upload-dropzone">
              {previewUrl ? (
                <img src={previewUrl} alt="Selected crop preview" className="scan-preview-image" />
              ) : (
                <span className="scan-upload-placeholder">
                  📷 Tap to choose a photo of the crop leaf
                </span>
              )}
            </label>
            <input
              id="scan-image"
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="scan-upload-input"
            />

            {error && <p className="form-error" role="alert">{error}</p>}

            <button type="submit" className="btn-primary" disabled={submitting || !file}>
              {submitting ? "Uploading…" : "Upload Photo"}
            </button>
          </form>
        )}

        {result && (
          <div className="status-card status-ok">
            <p className="status-title">✅ Uploaded</p>
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
                    Confidence: {(result.scan.confidence * 100).toFixed(1)}%
                  </p>
                )}
                {result.scan.predicted_disease.symptoms && (
                  <p><strong>Symptoms:</strong> {result.scan.predicted_disease.symptoms}</p>
                )}
                {result.scan.predicted_disease.prevention && (
                  <p><strong>Prevention:</strong> {result.scan.predicted_disease.prevention}</p>
                )}
                {result.scan.predicted_disease.treatment_info && (
                  <p><strong>Treatment:</strong> {result.scan.predicted_disease.treatment_info}</p>
                )}
              </div>
            )}

            <button type="button" className="btn-secondary" onClick={handleScanAnother} style={{ marginTop: 16 }}>
              Scan Another
            </button>
          </div>
        )}

        <p className="auth-switch">
          <Link to="/dashboard">Back to Dashboard</Link>
        </p>
      </main>
    </div>
  );
}
