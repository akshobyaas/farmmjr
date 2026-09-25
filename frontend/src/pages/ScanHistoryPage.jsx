import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { fetchScanHistory } from "../api/scans";

function formatDate(isoString) {
  return new Date(isoString).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function ScanHistoryPage() {
  const [results, setResults] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [hasPrevious, setHasPrevious] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadPage = useCallback((pageNumber) => {
    setLoading(true);
    setError("");
    fetchScanHistory(pageNumber)
      .then((data) => {
        setResults(data.results);
        setCount(data.count);
        setHasNext(Boolean(data.next));
        setHasPrevious(Boolean(data.previous));
      })
      .catch(() => setError("Could not load your scan history. Please try again."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadPage(page);
  }, [page, loadPage]);

  return (
    <div className="dashboard-page">
      <header className="app-header">
        <span className="app-header-icon">📜</span>
        <h1>Scan History</h1>
      </header>

      <main className="app-main">
        {loading && <p className="status-message">Loading your scans…</p>}
        {error && <p className="form-error" role="alert">{error}</p>}

        {!loading && !error && results.length === 0 && (
          <p className="status-message">
            You haven't scanned any crops yet. <Link to="/scan">Scan one now</Link>.
          </p>
        )}

        {!loading && !error && results.length > 0 && (
          <>
            <p className="status-message">{count} scan{count === 1 ? "" : "s"} total</p>
            <div className="scan-history-list">
              {results.map((scan) => (
                <Link key={scan.id} to={`/scan/history/${scan.id}`} className="scan-history-item">
                  {scan.image && (
                    <img src={scan.image} alt="" className="scan-history-thumbnail" />
                  )}
                  <div className="scan-history-info">
                    <p className="scan-history-disease">
                      {scan.disease_name
                        ? `${scan.disease_name}${scan.crop_name ? ` — ${scan.crop_name}` : ""}`
                        : "Prediction unavailable"}
                    </p>
                    <p className="scan-history-meta">
                      {typeof scan.confidence === "number" && `${(scan.confidence * 100).toFixed(1)}% · `}
                      {formatDate(scan.created_at)}
                    </p>
                  </div>
                </Link>
              ))}
            </div>

            <div className="scan-history-pagination">
              <button
                type="button"
                className="btn-secondary"
                disabled={!hasPrevious}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <span className="scan-history-page-label">Page {page}</span>
              <button
                type="button"
                className="btn-secondary"
                disabled={!hasNext}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          </>
        )}

        <p className="auth-switch">
          <Link to="/dashboard">Back to Dashboard</Link>
        </p>
      </main>
    </div>
  );
}
