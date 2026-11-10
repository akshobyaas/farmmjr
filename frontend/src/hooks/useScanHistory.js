import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { fetchScanHistory } from "../api/scans";

// Extracted verbatim from ScanHistoryPage.jsx's state/effect/loadPage, as
// part of the frontend structure cleanup (Sub-project 1). See
// FRONTEND_REFACTOR_IMPLEMENTATION_PLAN.md Task 7. formatDate() stays in
// the page -- pure presentation, not data-fetching.
//
// `cropFilter` (Task 12 fix round 1) is an optional id read from the URL's
// ?crop= param by the page -- the page still owns useSearchParams(), this
// hook just takes the value it needs, same pattern as useVideoSearch's
// initialQuery. Only passed through to fetchScanHistory when present, so
// every pre-existing call site/test (no filter) keeps calling it with the
// exact same single `page` argument as before -- no regression to the
// unfiltered view.
export function useScanHistory(cropFilter) {
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
    (cropFilter ? fetchScanHistory(pageNumber, cropFilter) : fetchScanHistory(pageNumber))
      .then((data) => {
        setResults(data.results);
        setCount(data.count);
        setHasNext(Boolean(data.next));
        setHasPrevious(Boolean(data.previous));
      })
      .catch(() => setError(t("scan.historyLoadError")))
      .finally(() => setLoading(false));
  }, [t, cropFilter]);

  // Reset to page 1 whenever the crop filter changes (e.g. following one
  // crop's "View all" link right after another's) so the next fetch below
  // starts the new filter from page 1 instead of re-requesting a stale
  // page number against it.
  useEffect(() => {
    setPage(1);
  }, [cropFilter]);

  useEffect(() => {
    loadPage(page);
  }, [page, cropFilter, loadPage]);

  return { results, count, page, setPage, hasNext, hasPrevious, loading, error };
}
