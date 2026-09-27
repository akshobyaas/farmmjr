import { useState, useEffect, useCallback } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { searchVideos } from "../api/videos";
import AppHeader from "../components/AppHeader";
import Icon from "../components/Icon";
import BottomNav from "../components/BottomNav";

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

  const [queryInput, setQueryInput] = useState(prefill);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);

  const runSearch = useCallback((query) => {
    if (!query.trim()) return;
    setLoading(true);
    setError("");
    setSearched(true);
    searchVideos(query.trim())
      .then((data) => setResults(data.results))
      .catch((err) => {
        setError(err.response?.data?.detail || t("videos.fetchError"));
        setResults(null);
      })
      .finally(() => setLoading(false));
  }, [t]);

  // Auto-run the search once if arriving with a pre-filled query, e.g. the
  // "Watch related videos" link on a crop's detail page.
  useEffect(() => {
    if (prefill.trim()) {
      runSearch(prefill);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    runSearch(queryInput);
  };

  return (
    <div className="dashboard-page">
      <AppHeader icon={<Icon name="play" />} title={t("videos.title")} className="videos-header" />

      <main className="app-main">
        <form className="videos-search-form" onSubmit={handleSubmit}>
          <label htmlFor="videos-query" className="sr-only">
            {t("videos.queryLabel")}
          </label>
          <input
            id="videos-query"
            type="text"
            placeholder={t("videos.queryPlaceholder")}
            value={queryInput}
            onChange={(e) => setQueryInput(e.target.value)}
            className="videos-query-input"
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
          <div className="videos-grid">
            {results.map((video) => (
              <a
                key={video.video_id}
                href={video.url}
                target="_blank"
                rel="noopener noreferrer"
                className="video-card"
              >
                {video.thumbnail && (
                  <img src={video.thumbnail} alt="" className="video-thumbnail" />
                )}
                <div className="video-info">
                  <p className="video-title">{video.title}</p>
                  <p className="video-meta">
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
