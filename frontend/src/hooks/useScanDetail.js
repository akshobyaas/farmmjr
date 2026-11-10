import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { fetchScanDetail } from "../api/scans";
import { useActiveTrackerForCrop } from "./useActiveTrackerForCrop";
import { useSaveScanToDiary } from "./useSaveScanToDiary";

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

  // Task 9 -- "Save to Diary" button. Unlike ScanUploadPage, this scan may
  // be any age, so the page itself is responsible for naming the scan's
  // own date in the confirmation copy -- the save always still targets
  // TODAY's entry (see the amendment on Task 9's brief).
  const activeTracker = useActiveTrackerForCrop(scan?.predicted_disease?.crop_name);
  const { status: diarySaveStatus, handleSaveToDiary } = useSaveScanToDiary(activeTracker, scan?.id);

  return { scan, error, activeTracker, diarySaveStatus, handleSaveToDiary };
}
