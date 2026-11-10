import { useState, useEffect } from "react";
import { saveDiaryEntry } from "../api/diary";

// Task 9 (Save to Diary on scan screens) -- the "Save to Diary" button's
// own click/status handling, shared by ScanUploadPage and
// ScanHistoryDetailPage. Deliberately thin: it only ever sends
// `{ tracker, scan_id }` (via diary.js's saveDiaryEntry's scanId param) --
// never entry_date, which the backend server-sets to today unconditionally
// (FarmingDiaryEntrySerializer.create -> diary_today()) and would ignore
// from the client anyway. See the amendment on Task 9's brief: both pages
// always write TODAY's entry: the two pages differ only in what their own
// confirmation copy says afterwards, not in what gets sent here.
export function useSaveScanToDiary(tracker, scanId) {
  const [status, setStatus] = useState("idle"); // idle | saving | saved | error

  // A fresh scan (new upload, or navigating to a different scan's detail
  // page) should never show a stale "Saved" / error from a previous scan.
  useEffect(() => {
    setStatus("idle");
  }, [scanId]);

  const handleSaveToDiary = async () => {
    if (!tracker || scanId == null) return;
    setStatus("saving");
    try {
      await saveDiaryEntry(tracker.id, { scanId });
      setStatus("saved");
    } catch {
      setStatus("error");
    }
  };

  return { status, handleSaveToDiary };
}
