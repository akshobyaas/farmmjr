import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useCropHealth } from "../hooks/useCropHealth";
import AppHeader from "../components/AppHeader";
import BottomNav from "../components/BottomNav";
import PageSkeleton from "../components/PageSkeleton";
import Icon from "../components/Icon";
import styles from "./CropHealthPage.module.css";

// Same short-date convention CropDetailPage/ScanHistoryPage already use.
function formatScanDate(isoString) {
  return new Date(isoString).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// Task 18 -- Crop Health page (UI_REDESIGN_DESIGN.md 7.5). Status
// derivation and the isDemo-is-always-true guarantee live in
// useCropHealth.js; this page is just the view. The demo-indicator
// disclosure below is deliberately rendered as plain visible text and a
// visible chip -- see Review Focus item 4 / CropHealthPage.test.jsx --
// never hidden behind a title/aria-label or a hover/focus-only tooltip.
export default function CropHealthPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const { loading, latestScan, scans, diaryEntries, riskAlert, status } = useCropHealth(id);

  if (loading) {
    return <PageSkeleton label={t("common.loading")} />;
  }

  return (
    <div className="dashboard-page">
      <AppHeader title={t("cropHealth.title")} />

      <main className="app-main">
        <div
          className={`status-card ${styles["health-status-card"]} ${styles[`health-status-${status.level}`]}`}
        >
          {/* Visible, real rendered text -- not an aria-label/title. This
              is the line Review Focus item 4 checks for with
              getByText(/demo indicator/i). */}
          <span className={`chip chip-warning ${styles["health-demo-badge"]}`}>
            {t("cropHealth.demoBadge")}
          </span>
          <h2 className={styles["health-status-title"]}>
            {t(`cropHealth.statusLevel.${status.level}`)}
          </h2>
          <p className={styles["health-demo-note"]}>{t("cropHealth.demoNote")}</p>

          {riskAlert && (
            <p className={styles["health-risk-alert"]}>
              {t("cropHealth.activeRiskAlert", { disease: riskAlert.disease_name })}
            </p>
          )}
        </div>

        <section className={styles["health-section"]}>
          <h2 className="crop-section-title">{t("cropHealth.latestScanTitle")}</h2>
          {latestScan ? (
            <div className="field-box">
              <span className="field-box-label">{formatScanDate(latestScan.created_at)}</span>
              <span className="field-box-input">
                {latestScan.disease_name || t("scan.predictionUnavailable")}
              </span>
              {typeof latestScan.confidence === "number" && (
                <span className="stat-tile-hint">
                  {t("scan.confidence", { pct: (latestScan.confidence * 100).toFixed(1) })}
                </span>
              )}
            </div>
          ) : (
            <p className="status-message">{t("cropHealth.noScanMessage")}</p>
          )}
        </section>

        {scans.length > 0 && (
          <section className={styles["health-section"]}>
            <h2 className="crop-section-title">{t("cropHealth.scanHistoryTitle")}</h2>
            <div className={styles["health-scan-list"]}>
              {scans.map((scan) => (
                <Link key={scan.id} to={`/scan/history/${scan.id}`} className="list-row">
                  <span className="list-row-icon" aria-hidden="true">
                    {scan.image ? <img src={scan.image} alt="" /> : <Icon name="search" size={20} />}
                  </span>
                  <span className="list-row-text">
                    <span className="list-row-title">
                      {scan.disease_name || t("scan.predictionUnavailable")}
                    </span>
                    <span className="list-row-subtitle">{formatScanDate(scan.created_at)}</span>
                  </span>
                  <span className="list-row-chevron" aria-hidden="true">
                    <Icon name="chevronRight" size={18} />
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className={styles["health-section"]}>
          <h2 className="crop-section-title">{t("cropHealth.diaryTitle")}</h2>
          {diaryEntries.length === 0 ? (
            <p className="status-message">{t("cropHealth.noDiaryEntries")}</p>
          ) : (
            <div className={styles["health-diary-list"]}>
              {diaryEntries.map((entry) => (
                <div key={entry.id} className={styles["health-diary-entry"]}>
                  <p className={styles["health-diary-date"]}>{entry.entry_date}</p>
                  {entry.note && <p className={styles["health-diary-note"]}>{entry.note}</p>}
                </div>
              ))}
            </div>
          )}
        </section>

        <p className="auth-switch">
          <Link to={`/crops/${id}`}>{t("cropHealth.backToCrop")}</Link>
        </p>
      </main>
      <BottomNav />
    </div>
  );
}
