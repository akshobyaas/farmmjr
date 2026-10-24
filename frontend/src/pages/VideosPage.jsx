import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useVideoSearch } from "../hooks/useVideoSearch";
import AppHeader from "../components/AppHeader";
import BottomNav from "../components/BottomNav";
import styles from "./VideosPage.module.css";

function formatDate(isoString) {
  if (!isoString) return "";
  return new Date(isoString).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function VideosPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const prefill = searchParams.get("q") || "";

  const { queryInput, setQueryInput, results, loading, error, searched, handleSubmit } = useVideoSearch(prefill);

  return (
    <div className="dashboard-page">
      <AppHeader title={t("videos.title")} className="videos-header" />

      <main className="app-main">
        <form className={styles["videos-search-form"]} onSubmit={handleSubmit}>
          <label htmlFor="videos-query" className="sr-only">
            {t("videos.queryLabel")}
          </label>
          <input
            id="videos-query"
            type="text"
            placeholder={t("videos.queryPlaceholder")}
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            className={styles["videos-query-input"]}
          />
          <button type="submit" className="btn-primary" disabled={loading || !queryInput.trim()}>
            {t("common.search")}
          </button>
        </form>

        {loading && <p className="status-message">{t("videos.loading")}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}

        {!loading && !error && searched && results && results.length === 0 && (
          <p className="status-message">{t("videos.noResults")}</p>
        )}

        {!loading && !error && results && results.length > 0 && (
          <div className={styles["videos-grid"]}>
            {results.map((video) => (
              <a
                key={video.video_id}
                href={video.url}
                target="_blank"
                rel="noopener noreferrer"
                className={styles["video-card"]}
              >
                {video.thumbnail && (
                  <img src={video.thumbnail} alt="" className={styles["video-thumbnail"]} />
                )}
                <div className={styles["video-info"]}>
                  <p className={styles["video-title"]}>{video.title}</p>
                  <p className={styles["video-meta"]}>
                    {video.channel_title}
                    {video.published_at && ` · ${formatDate(video.published_at)}`}
                  </p>
                </div>
              </a>
            ))}
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
