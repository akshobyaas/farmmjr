import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { fetchScanDetail } from "../api/scans";

// Extracted verbatim from ScanHistoryDetailPage.jsx's state/effect, as
// part of the frontend structure cleanup (Sub-project 1). See
// FRONTEND_REFACTOR_IMPLEMENTATION_PLAN.md Task 7.
export function useScanDetail(id) {
  const { t } = useTranslation();
  const [scan, setScan] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setScan(null);
    setError("");
    fetchScanDetail(id)
      .then((data) => setScan(data))
      .catch((err) => {
        if (err.response?.status === 404 || err.response?.status === 403) {
          // A 403 here (IsScanOwner) reads the same as "not found" to the
          // farmer -- we never confirm or deny that some OTHER user's scan
          // ID exists, that would itself be a minor information leak.
          setError(t("scan.notFound"));
        } else {
          setError(t("scan.loadError"));
        }
      });
  }, [id, t]);

  return { scan, error };
}
