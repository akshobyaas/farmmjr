import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { fetchScanDetail } from "../api/scans";

export default function ScanHistoryDetailPage() {
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
          setError("This scan could not be found.");
        } else {
          setError("Could not load this scan. Please try again.");
        }
      });
  }, [id]);

  if (error) {
    return (
      <div className="dashboard-page">
        <header className="app-header">
          <span className="app-header-icon">📜</span>
          <h1>Scan Result</h1>
        </header>
        <main className="app-main">
          <p className="form-error" role="alert">{error}</p>
          <Link to="/scan/history" className="auth-switch">Back to Scan History</Link>
        </main>
      </div>
    );
  }

  if (!scan) {
    return <div className="loading-screen">Loading scan…</div>;
  }

  return (
    <div className="dashboard-page">
      <header className="app-header">
        <span className="app-header-icon">📜</span>
        <h1>Scan Result</h1>
      </header>

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
                  Confidence: {(scan.confidence * 100).toFixed(1)}%
                </p>
              )}
              {scan.predicted_disease.symptoms && (
                <p><strong>Symptoms:</strong> {scan.predicted_disease.symptoms}</p>
              )}
              {scan.predicted_disease.prevention && (
                <p><strong>Prevention:</strong> {scan.predicted_disease.prevention}</p>
              )}
              {scan.predicted_disease.treatment_info && (
                <p><strong>Treatment:</strong> {scan.predicted_disease.treatment_info}</p>
              )}
            </div>
          ) : (
            <p className="status-message">Prediction unavailable for this scan.</p>
          )}
        </div>

        <p className="auth-switch">
          <Link to="/scan/history">Back to Scan History</Link>
        </p>
      </main>
    </div>
  );
}
