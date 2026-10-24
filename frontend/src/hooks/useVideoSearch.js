import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { searchVideos } from "../api/videos";

// Extracted verbatim from VideosPage.jsx's state/effect/handlers, as part
// of the frontend structure cleanup (Sub-project 1). See
// FRONTEND_REFACTOR_IMPLEMENTATION_PLAN.md Task 7. formatDate() stays in
// the page -- pure presentation, not data-fetching.
//
// `initialQuery` replaces the page's own `searchParams.get("q")` read --
// the page still owns useSearchParams(); this hook just takes the value
// it needs, same pattern as useAdvisoryQueries's initialPrefill.
export function useVideoSearch(initialQuery) {
  const { t } = useTranslation();
  const [queryInput, setQueryInput] = useState(initialQuery);
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
    if (initialQuery.trim()) {
      runSearch(initialQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    runSearch(queryInput);
  };

  return { queryInput, setQueryInput, results, loading, error, searched, handleSubmit };
}
