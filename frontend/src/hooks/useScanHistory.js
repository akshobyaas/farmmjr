import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { fetchScanHistory } from "../api/scans";

// Extracted verbatim from ScanHistoryPage.jsx's state/effect/loadPage, as
// part of the frontend structure cleanup (Sub-project 1). See
// FRONTEND_REFACTOR_IMPLEMENTATION_PLAN.md Task 7. formatDate() stays in
// the page -- pure presentation, not data-fetching.
export function useScanHistory() {
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

  return { results, count, page, setPage, hasNext, hasPrevious, loading, error };
}
