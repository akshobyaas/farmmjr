import { useState, useEffect } from "react";
import { fetchCrops } from "../api/crops";
import { fetchTrackers } from "../api/cropTracker";

// Task 9 (Save to Diary on scan screens) -- a scan only ever carries its
// crop's NAME (predicted_disease.crop_name, ScanResultSerializer /
// ScanHistoryListSerializer), never a crop id, so there is nothing to
// compare a tracker's `crop` (a bare FK id, FarmerCropTrackerSerializer)
// against directly. This resolves the name to an id via the existing
// public crop catalog (GET /crops/, same one CropListPage already uses)
// and then matches it against the farmer's own trackers (GET
// /crops/trackers/, same one useCropTracker already uses) -- reusing both
// endpoints exactly as the Task 9 brief asks, rather than adding a new one.
//
// Only an is_active tracker counts: a farmer who stopped tracking a crop
// (is_active=False) shouldn't see "Save to Diary" resurrect it.
export function useActiveTrackerForCrop(cropName) {
  const [tracker, setTracker] = useState(null);

  useEffect(() => {
    if (!cropName) {
      setTracker(null);
      return;
    }

    let cancelled = false;
    Promise.all([fetchCrops(), fetchTrackers()])
      .then(([crops, trackers]) => {
        if (cancelled) return;
        const crop = Array.isArray(crops) ? crops.find((c) => c.name === cropName) : null;
        const match =
          crop && Array.isArray(trackers)
            ? trackers.find((tr) => tr.is_active && String(tr.crop) === String(crop.id))
            : null;
        setTracker(match || null);
      })
      .catch(() => {
        // Fail soft, same convention as useCropTracker/useDashboardData --
        // this is a nice-to-have button, not critical path. Worst case the
        // button just doesn't show.
        if (!cancelled) setTracker(null);
      });

    return () => {
      cancelled = true;
    };
  }, [cropName]);

  return tracker;
}
