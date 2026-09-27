import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { fetchScanHistory } from "../api/scans";
import AppHeader from "../components/AppHeader";
import Icon from "../components/Icon";
import BottomNav from "../components/BottomNav";

function formatDate(isoString) {
  return new Date(isoString).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function ScanHistoryPage() {
  const { t } = useTranslation();
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
      .catch(() => setError(t("scan.historyLoadError")))
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => {
    loadPage(page);
  }, [page, loadPage]);

  return (
    <div className="dashboard-page">
      <AppHeader icon={<Icon name="history" />} title={t("scan.historyTitle")} />

      <main className="app-main">
        {loading && <p className="status-message">{t("scan.historyLoading")}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}

        {!loading && !error && results.length === 0 && (
          <p className="status-message">
            {t("scan.historyEmpty")} <Link to="/scan">{t("scan.scanNowLink")}</Link>.
          </p>
        )}

        {!loading && !error && results.length > 0 && (
          <>
            <p className="status-message">
              {count === 1
                ? t("scan.totalCount", { count })
                : t("scan.totalCountPlural", { count })}
            </p>
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
                        : t("scan.predictionUnavailable")}
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
                {t("common.previous")}
              </button>
              <span className="scan-history-page-label">{t("scan.pageLabel", { page })}</span>
              <button
                type="button"
                className="btn-secondary"
                disabled={!hasNext}
                onClick={() => setPage((p) => p + 1)}
              >
                {t("common.next")}
              </button>
            </div>
          </>
        )}

        <p className="auth-switch">
          <Link to="/dashboard">{t("common.backToDashboard")}</Link>
        </p>
      </main>
      <BottomNav />
    </div>
  );
}
