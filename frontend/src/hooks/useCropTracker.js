import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { fetchTrackers, createTracker, updateTracker } from "../api/cropTracker";
import { useAuth } from "../context/AuthContext";

// Extracted from CropDetailPage.jsx's tracker state/effect/handlers (Task 6
// of the USP crop-tracker feature), as part of the frontend structure
// cleanup (Sub-project 1). See FRONTEND_REFACTOR_IMPLEMENTATION_PLAN.md
// Task 3.
//
// handleTrackerSubmit takes { isDayBasedCrop, crop } at call time rather
// than at construction time, mirroring exactly how the original inline
// function closed over those two values from the page's render scope --
// both are derived from the crop-detail fetch, which stays in the page
// (or a sibling concern), not in this hook.
//
// Ruling (final whole-branch review, Task 8/9): the original page had ONE
// combined effect with deps [id, t] that fetched both the crop detail
// (whose error messages call t(...)) and the tracker list (whose fetch/
// match logic never touches t at all) together. Splitting that into this
// hook's own effect below means the tracker-fetch effect's *real*
// dependency is cropId alone -- t is simply unused inside this effect's
// body, so including it would violate exhaustive-deps, not satisfy it.
// This is a deliberate correction, not an accidental drift: the original
// [id, t] effect re-fetched trackers (and reset showTrackerForm/
// trackerError, wiping any in-progress tracker-form input) on every
// language switch, even though tracker data has no language dependency
// (no Accept-Language header is sent; stage names render from an object
// already on the tracker). Verified via useCropTracker.test.js's
// "does not re-fetch trackers when only the UI language changes" test.
export function useCropTracker(cropId) {
  const { t } = useTranslation();
  const { user, updateProfile } = useAuth();

  const [tracker, setTracker] = useState(null);
  const [showTrackerForm, setShowTrackerForm] = useState(false);
  const [plantingDate, setPlantingDate] = useState("");
  const [selectedStageId, setSelectedStageId] = useState("");
  const [trackerSubmitting, setTrackerSubmitting] = useState(false);
  const [trackerError, setTrackerError] = useState("");

  useEffect(() => {
    setTracker(null);
    setShowTrackerForm(false);
    setTrackerError("");

    fetchTrackers()
      .then((data) => {
        const match = data.find((tr) => String(tr.crop) === String(cropId));
        setTracker(match || null);
      })
      .catch(() => {
        // Nothing to track yet, or the request failed -- either way, the
        // page just falls back to offering "Track This Crop" from scratch.
      });
  }, [cropId]);

  const openTrackerForm = () => {
    setTrackerError("");
    setPlantingDate(tracker?.planting_date || "");
    setSelectedStageId(tracker?.current_stage ? String(tracker.current_stage.id) : "");
    setShowTrackerForm(true);
  };

  const closeTrackerForm = () => {
    setShowTrackerForm(false);
    setTrackerError("");
  };

  const handleTrackerSubmit = async (e, { isDayBasedCrop, crop }) => {
    e.preventDefault();
    setTrackerError("");
    setTrackerSubmitting(true);
    // Captured before the awaits below so it reflects whether this call is
    // creating a brand-new tracker vs. updating an existing one, regardless
    // of what `tracker` state becomes afterwards.
    const isCreatingNewTracker = !tracker;
    try {
      let saved;
      if (tracker) {
        const fields = isDayBasedCrop
          ? { planting_date: plantingDate }
          : { current_stage: Number(selectedStageId) };
        saved = await updateTracker(tracker.id, fields);
      } else if (isDayBasedCrop) {
        saved = await createTracker({ cropId: crop.id, plantingDate });
      } else {
        saved = await createTracker({ cropId: crop.id, currentStage: Number(selectedStageId) });
      }
      setTracker(saved);
      setShowTrackerForm(false);

      // Fix round 1 (Task 19 review finding): a farmer is only left
      // "in_progress" by WelcomePage's "Get Started" (see WelcomePage.jsx)
      // until THIS -- actually creating a tracker -- happens. This must
      // not fire for an update to an already-existing tracker (that is not
      // the onboarding milestone), and must not fire for a farmer who is
      // already "completed"/"skipped"/"not_started" (nothing to flip).
      // Fire-and-forget: a failure here shouldn't undo the tracker that
      // was just successfully created.
      if (isCreatingNewTracker && user?.onboarding_status === "in_progress") {
        updateProfile({ onboarding_status: "completed" }).catch(() => {});
      }
    } catch (err) {
      const data = err.response?.data;
      if (data && typeof data === "object") {
        const firstField = Object.keys(data)[0];
        const message = Array.isArray(data[firstField]) ? data[firstField][0] : data[firstField];
        setTrackerError(message || t("crops.tracker.saveError"));
      } else {
        setTrackerError(t("crops.tracker.saveError"));
      }
    } finally {
      setTrackerSubmitting(false);
    }
  };

  return {
    tracker,
    showTrackerForm,
    plantingDate,
    setPlantingDate,
    selectedStageId,
    setSelectedStageId,
    trackerSubmitting,
    trackerError,
    openTrackerForm,
    closeTrackerForm,
    handleTrackerSubmit,
  };
}
