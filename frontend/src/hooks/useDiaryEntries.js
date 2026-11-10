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
  // Task 11 -- Dynamic Diary Fields (UI redesign spec 7.3). Kept as
  // strings (not numbers) even for the numeric model fields
  // (duration_minutes/quantity/cost_amount) so a <input type="number">
  // can stay a fully controlled component through an empty value -- the
  // conversion to "send as empty => backend stores null" happens for free
  // over multipart FormData (see api/diary.js), no parseFloat needed here.
  durationMinutes: "",
  quantity: "",
  quantityUnit: "",
  productName: "",
  costAmount: "",
  harvestQualityNote: "",
};

// Task 11 -- which of the six Task 10 fields the diary form should show,
// given the CURRENT checked activity boxes. Centralized here (not
// duplicated in CropDetailPage.jsx) because both the page (what to
// render) and handleDiarySubmit below (what to actually send) need the
// exact same answer.
//
// The design spec (UI_REDESIGN_DESIGN.md 7.3) maps these onto four
// conceptual activity types -- irrigation, fertilizer, "treatment" and
// "harvest" -- but FarmingDiaryEntry (Task 10) only has the four
// pre-existing boolean flags: did_irrigation/did_fertilizer/did_spraying/
// did_pruning. There is no did_treatment or did_harvest. Spraying
// (applying a pesticide/fungicide) is the closest fit for "treatment";
// pruning is the one remaining flag and stands in for "harvest" (see
// task-11-report.md for the full reasoning -- this is a judgment call,
// not something confirmed against a did_harvest/did_treatment field that
// doesn't exist).
//
// Several fields are deliberately shared across more than one type in
// the spec itself (quantity/quantity_unit cover irrigation, fertilizer
// AND harvest; product_name covers fertilizer AND treatment; cost_amount
// is explicitly "available for any checked type"). Each field here is
// therefore an OR across every type that uses it, so a farmer who ticks
// two overlapping types (e.g. Irrigation + Fertilizer) sees ONE Quantity
// box, never two -- same non-duplication rule the brief calls out for
// cost_amount, applied uniformly to every shared field rather than just
// that one.
export function getDiaryFieldVisibility(form) {
  return {
    showDuration: form.didIrrigation,
    showQuantity: form.didIrrigation || form.didFertilizer || form.didPruning,
    showProductName: form.didFertilizer || form.didSpraying,
    showCost: form.didIrrigation || form.didFertilizer || form.didSpraying || form.didPruning,
    showHarvestNote: form.didPruning,
  };
}

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
        // Task 11 -- prefilled from whatever was actually saved,
        // regardless of today's checkbox state: if the farmer re-ticks
        // Irrigation later on the same visit, the field group that
        // reappears shows the value already on file instead of a blank.
        durationMinutes: todayEntry.duration_minutes != null ? String(todayEntry.duration_minutes) : "",
        quantity: todayEntry.quantity != null ? String(todayEntry.quantity) : "",
        quantityUnit: todayEntry.quantity_unit || "",
        productName: todayEntry.product_name || "",
        costAmount: todayEntry.cost_amount != null ? String(todayEntry.cost_amount) : "",
        harvestQualityNote: todayEntry.harvest_quality_note || "",
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
      // Task 11 -- strip-at-submit: whatever is typed into a now-hidden
      // field group (e.g. a Duration the farmer typed before unchecking
      // Irrigation) is replaced with "" here, using the SAME visibility
      // this render pass used to decide what to show -- so a stale value
      // sitting in React state from before an uncheck is never silently
      // sent. "" (not omitted) is sent deliberately, same as
      // otherActivityNote just below: it's what actually clears an
      // already-saved same-day value on the backend's merge path, not
      // just "don't resend the new unsaved one."
      const visibility = getDiaryFieldVisibility(diaryForm);
      const saved = await saveDiaryEntry(tracker.id, {
        didIrrigation: diaryForm.didIrrigation,
        didFertilizer: diaryForm.didFertilizer,
        didSpraying: diaryForm.didSpraying,
        didPruning: diaryForm.didPruning,
        otherActivityNote: diaryForm.didOther ? diaryForm.otherActivityNote : "",
        note: diaryForm.note,
        photoFile: diaryForm.photoFile,
        durationMinutes: visibility.showDuration ? diaryForm.durationMinutes : "",
        quantity: visibility.showQuantity ? diaryForm.quantity : "",
        quantityUnit: visibility.showQuantity ? diaryForm.quantityUnit : "",
        productName: visibility.showProductName ? diaryForm.productName : "",
        costAmount: visibility.showCost ? diaryForm.costAmount : "",
        harvestQualityNote: visibility.showHarvestNote ? diaryForm.harvestQualityNote : "",
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
