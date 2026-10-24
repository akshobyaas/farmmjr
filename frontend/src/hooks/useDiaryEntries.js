import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { fetchDiaryEntries, saveDiaryEntry } from "../api/diary";

// Extracted verbatim from CropDetailPage.jsx's diary state/effect/handlers
// (Task 6/7 of the Farming Diary feature) -- moved, not rewritten, as part
// of the frontend structure cleanup (Sub-project 1). See
// FRONTEND_REFACTOR_IMPLEMENTATION_PLAN.md Task 3.
//
// Re-fetches whenever `tracker`'s identity changes -- same dependency this
// effect had inline, including the same eslint-disable, since
// applyDiaryPrefill/fetchDiaryEntries are stable closures recreated each
// render, not missing deps.
const emptyDiaryForm = {
  didIrrigation: false,
  didFertilizer: false,
  didSpraying: false,
  didPruning: false,
  didOther: false,
  otherActivityNote: "",
  note: "",
  photoFile: null,
};

export function useDiaryEntries(tracker) {
  const { t } = useTranslation();

  const [diaryEntries, setDiaryEntries] = useState([]);
  const [diaryForm, setDiaryForm] = useState(emptyDiaryForm);
  const [diarySubmitting, setDiarySubmitting] = useState(false);
  const [diaryError, setDiaryError] = useState("");

  const applyDiaryPrefill = (entries) => {
    // The browser's LOCAL date, not UTC's (toISOString): for a farmer in
    // India, UTC is still "yesterday" until 05:30 IST. "en-CA" formats as
    // YYYY-MM-DD, matching the backend's entry_date (also IST-based).
    const todayISO = new Date().toLocaleDateString("en-CA");
    const todayEntry = entries.find((entry) => entry.entry_date === todayISO);
    if (todayEntry) {
      setDiaryForm({
        didIrrigation: !!todayEntry.did_irrigation,
        didFertilizer: !!todayEntry.did_fertilizer,
        didSpraying: !!todayEntry.did_spraying,
        didPruning: !!todayEntry.did_pruning,
        didOther: !!todayEntry.other_activity_note,
        otherActivityNote: todayEntry.other_activity_note || "",
        note: todayEntry.note || "",
        photoFile: null,
      });
    } else {
      setDiaryForm(emptyDiaryForm);
    }
  };

  useEffect(() => {
    if (!tracker) {
      setDiaryEntries([]);
      setDiaryForm(emptyDiaryForm);
      return;
    }
    fetchDiaryEntries(tracker.id)
      .then((entries) => {
        setDiaryEntries(entries);
        applyDiaryPrefill(entries);
      })
      .catch(() => {
        // Same fail-soft pattern as the tracker fetch -- the diary is
        // secondary to the crop detail/tracker itself.
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracker]);

  const handleDiarySubmit = async (e) => {
    e.preventDefault();
    setDiaryError("");
    setDiarySubmitting(true);
    try {
      const saved = await saveDiaryEntry(tracker.id, {
        didIrrigation: diaryForm.didIrrigation,
        didFertilizer: diaryForm.didFertilizer,
        didSpraying: diaryForm.didSpraying,
        didPruning: diaryForm.didPruning,
        otherActivityNote: diaryForm.didOther ? diaryForm.otherActivityNote : "",
        note: diaryForm.note,
        photoFile: diaryForm.photoFile,
      });
      const updatedEntries = [
        saved,
        ...diaryEntries.filter((entry) => entry.entry_date !== saved.entry_date),
      ];
      setDiaryEntries(updatedEntries);
      applyDiaryPrefill(updatedEntries);
    } catch (err) {
      const data = err.response?.data;
      if (data && typeof data === "object") {
        const firstField = Object.keys(data)[0];
        const message = Array.isArray(data[firstField]) ? data[firstField][0] : data[firstField];
        setDiaryError(message || t("crops.diary.saveError"));
      } else {
        setDiaryError(t("crops.diary.saveError"));
      }
    } finally {
      setDiarySubmitting(false);
    }
  };

  return {
    diaryEntries,
    diaryForm,
    setDiaryForm,
    diarySubmitting,
    diaryError,
    handleDiarySubmit,
  };
}
