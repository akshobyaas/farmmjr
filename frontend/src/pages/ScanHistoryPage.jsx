import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useScanHistory } from "../hooks/useScanHistory";
import AppHeader from "../components/AppHeader";
import BottomNav from "../components/BottomNav";
import Icon from "../components/Icon";
import styles from "./ScanHistoryPage.module.css";

function formatDate(isoString) {
  return new Date(isoString).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function ScanHistoryPage() {
  const { t } = useTranslation();
  const { results, count, page, setPage, hasNext, hasPrevious, loading, error } = useScanHistory();

  return (
    <div className="dashboard-page">
      <AppHeader title={t("scan.historyTitle")} />

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
            <div className={styles["scan-history-list"]}>
              {results.map((scan) => (
                <Link key={scan.id} to={`/scan/history/${scan.id}`} className="list-row">
                  <span className="list-row-icon" aria-hidden="true">
                    {scan.image ? (
                      <img src={scan.image} alt="" />
                    ) : (
                      <Icon name="search" size={20} />
                    )}
                  </span>
                  <span className="list-row-text">
                    <span className="list-row-title">
                      {scan.disease_name
                        ? `${scan.disease_name}${scan.crop_name ? ` — ${scan.crop_name}` : ""}`
                        : t("scan.predictionUnavailable")}
                    </span>
                    <span className="list-row-subtitle">
                      {typeof scan.confidence === "number" && `${(scan.confidence * 100).toFixed(1)}% · `}
                      {formatDate(scan.created_at)}
                    </span>
                  </span>
                  <span className="list-row-chevron" aria-hidden="true">
                    <Icon name="chevronRight" size={18} />
                  </span>
                </Link>
              ))}
            </div>

            <div className={styles["scan-history-pagination"]}>
              <button
                type="button"
                className="btn-secondary"
                disabled={!hasPrevious}
                onClick={() => setPage((p) => p - 1)}
              >
                {t("common.previous")}
              </button>
              <span className={styles["scan-history-page-label"]}>{t("scan.pageLabel", { page })}</span>
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
