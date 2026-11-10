import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useVideoSearch } from "../hooks/useVideoSearch";
import AppHeader from "../components/AppHeader";
import BottomNav from "../components/BottomNav";
import Icon from "../components/Icon";
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
        {/* Search card restyle -- same merged pill-shaped bar + circular
            icon-only submit button as LocatorPage's/WeatherPage's own
            search-card/search-pill, instead of the old boxed-label
            field-box beside a separate rectangular Search button. The
            field's accessible label moves to a visually-hidden <label>
            (shared.css's .sr-only), same as Locator/Weather. */}
        <div className={styles["search-card"]}>
          <label htmlFor="videos-query" className="sr-only">
            {t("videos.queryLabel")}
          </label>
          <form className={styles["search-pill"]} onSubmit={handleSubmit}>
            <input
              id="videos-query"
              type="text"
              placeholder={t("videos.queryPlaceholder")}
              value={queryInput}
              onChange={(e) => setQueryInput(e.target.value)}
              className={styles["search-pill-input"]}
            />
            {queryInput && (
              <button
                type="button"
                className={styles["search-clear-btn"]}
                onClick={() => setQueryInput("")}
                aria-label={t("common.clear")}
              >
                <Icon name="close" size={14} />
              </button>
            )}
            <button
              type="submit"
              className={styles["search-pill-submit"]}
              disabled={loading || !queryInput.trim()}
              aria-label={t("common.search")}
            >
              <Icon name="search" size={18} />
            </button>
          </form>
        </div>

        {loading && <p className="status-message">{t("videos.loading")}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}

        {!loading && !error && searched && results && results.length === 0 && (
          <p className="status-message">{t("videos.noResults")}</p>
        )}

        {!loading && !error && results && results.length > 0 && (
          <div className={styles["videos-list"]}>
            {results.map((video) => (
              <a
                key={video.video_id}
                href={video.url}
                target="_blank"
                rel="noopener noreferrer"
                className="list-row"
              >
                <span className="list-row-icon" aria-hidden="true">
                  {video.thumbnail ? (
                    <img src={video.thumbnail} alt="" />
                  ) : (
                    <Icon name="play" size={20} />
                  )}
                </span>
                <span className="list-row-text">
                  <span className="list-row-title">{video.title}</span>
                  <span className="list-row-subtitle">
                    {video.channel_title}
                    {video.published_at && ` · ${formatDate(video.published_at)}`}
                  </span>
                </span>
                <span className="list-row-chevron">
                  <Icon name="chevronRight" size={18} />
                </span>
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
