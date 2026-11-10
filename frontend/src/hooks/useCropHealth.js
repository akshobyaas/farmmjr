import { useEffect, useState } from "react";
import { fetchScanHistory } from "../api/scans";
import { fetchDiaryEntries } from "../api/diary";
import { fetchTrackers, fetchRiskAlerts } from "../api/cropTracker";
import { LOW_CONFIDENCE_THRESHOLD } from "../components/LowConfidenceNudge";

// Task 18 -- Crop Health page (UI_REDESIGN_DESIGN.md 7.5).
//
// *** Integrity note, read before touching deriveHealthStatus ***
// There is no validated crop-health score anywhere in this system. The ML
// model behind scans (backend/scans/ml_model.py, via
// ScanUploadView.create) only ever classifies an image into one of its
// trained disease classes or fails to produce a usable prediction at all
// -- there is no "healthy"/"no disease" class in the training data
// (confirmed against ml-training/training_report.md and the seeded
// Disease rows: neither has anything named "healthy"). `predicted_disease`
// being null on a ScanHistory row means "no confident prediction was
// made", not "this plant is healthy". So `status.level` below is a
// best-effort, clearly-documented DEMO indicator built only from the
// signals this app actually has (a disease name + confidence on the most
// recent scan, plus whether a proactive weather-risk alert is currently
// active for this crop) -- it is not, and must never be presented as, a
// real diagnosis. `isDemo` is therefore a hardcoded constant, never
// computed: see deriveHealthStatus below, which has no branch that
// produces `isDemo: false`.
//
// One more wrinkle worth documenting: the crop-filtered scan history this
// hook reuses (GET /scans/history/?crop=<id>, Task 12) filters on
// `predicted_disease__crop_id` (backend/scans/views.py
// ScanHistoryListView.get_queryset) -- i.e. it already ONLY returns scans
// that matched a disease for this crop. A scan with no prediction at all
// never appears in this filtered list in the first place. That means the
// "good" branch below (no disease on the latest scan) is reachable in
// principle -- e.g. if a future change relaxes that filter, or for a
// crop whose only scans genuinely carry a non-disease signal -- but is
// not expected to occur in practice through this exact endpoint today.
// Documented here rather than silently relied upon.

// Exact thresholds (deliberately conservative -- see integrity note above):
//   - No scan at all for this crop yet -> "unknown". There is nothing to
//     assess, and forcing "good" on an absent scan would read as "nothing
//     wrong" when really nothing has been checked at all.
//   - Latest scan has no disease_name -> "good" (see the scan-history
//     filter wrinkle above for why this is rare in practice), UNLESS an
//     active risk alert exists for this crop's tracker, in which case it
//     is bumped to "watch" -- a proactive weather-driven disease risk
//     (DiseaseRiskRule, Task 12) is a real, independently-evaluated signal
//     that a scan alone wouldn't catch, so "good" shouldn't be shown next
//     to a live warning about the same crop.
//   - Latest scan has a disease_name but confidence is missing or below
//     LOW_CONFIDENCE_THRESHOLD (0.6, the same cutoff LowConfidenceNudge
//     already uses to flag an uncertain prediction elsewhere in the app)
//     -> "watch". The model found *something* but isn't confident enough
//     to call it a firm diagnosis, so this sits a notch below "concern"
//     rather than claiming certainty the model doesn't have.
//   - Latest scan has a disease_name with confidence >= 0.6 -> "concern".
// An active risk alert only ever bumps "good" up to "watch" -- it never
// downgrades an existing "watch"/"concern" (the scan signal already
// dominates) and never upgrades "watch" to "concern" (a weather-driven
// risk forecast and a confident image-based diagnosis are different kinds
// of evidence; conflating them into one bumped level would overstate what
// either one alone actually shows).
export function deriveHealthStatus({ latestScan, hasActiveRiskAlert }) {
  let level;
  if (!latestScan) {
    level = "unknown";
  } else if (!latestScan.disease_name) {
    level = "good";
  } else if (typeof latestScan.confidence !== "number" || latestScan.confidence < LOW_CONFIDENCE_THRESHOLD) {
    level = "watch";
  } else {
    level = "concern";
  }

  if (hasActiveRiskAlert && level === "good") {
    level = "watch";
  }

  // Hardcoded, never computed -- see the integrity note above. There must
  // be no code path through this function that returns isDemo: false.
  return { level, isDemo: true };
}

function findTrackerForCrop(trackers, cropId) {
  if (!Array.isArray(trackers)) return null;
  return trackers.find((tr) => String(tr.crop) === String(cropId)) || null;
}

// Mirrors useDashboardData.js's extractRiskAlert, but narrowed to the ONE
// tracker that matches this page's crop (useDashboardData instead picks
// the single most-urgent alert across every tracker, which is the right
// behavior for the dashboard but not for a single crop's own health page).
function findRiskAlertForCrop(riskAlertsData, cropId) {
  const trackers = riskAlertsData?.trackers;
  if (!Array.isArray(trackers)) return null;

  const match = trackers.find((tr) => String(tr.crop_id) === String(cropId));
  if (!match) return null;

  // Each tracker's own risk_alerts list is already sorted highest-risk-
  // first by the backend (risk_engine.evaluate_risk), so the first entry
  // is this crop's single most urgent active alert.
  if (Array.isArray(match.risk_alerts) && match.risk_alerts.length > 0) {
    return match.risk_alerts[0];
  }
  return null;
}

export function useCropHealth(cropId) {
  const [tracker, setTracker] = useState(null);
  const [scans, setScans] = useState([]);
  const [diaryEntries, setDiaryEntries] = useState([]);
  const [riskAlert, setRiskAlert] = useState(null);
  const [loading, setLoading] = useState(true);

  // Which tracker (if any) belongs to this crop -- same lookup
  // useCropTracker.js does, needed here only to scope the diary fetch
  // below to the right tracker.
  useEffect(() => {
    setTracker(null);
    fetchTrackers()
      .then((data) => setTracker(findTrackerForCrop(data, cropId)))
      .catch(() => setTracker(null));
  }, [cropId]);

  // The primary signal for this page -- Task 12's crop-filtered scan
  // history. `loading` gates on this fetch alone (tracker/diary/risk-alert
  // are secondary, fail-soft fetches, same convention as
  // useDashboardData/useCropTracker/useDiaryEntries elsewhere in this app).
  useEffect(() => {
    setScans([]);
    setLoading(true);
    fetchScanHistory(1, cropId)
      .then((data) => setScans(data?.results || []))
      .catch(() => setScans([]))
      .finally(() => setLoading(false));
  }, [cropId]);

  // Diary entries for the tracker matching this crop -- same
  // fetchDiaryEntries helper CropDetailPage's useDiaryEntries uses, scoped
  // to the one tracker this page cares about. No tracker yet -> nothing to
  // fetch, same "no tracker" short-circuit useDiaryEntries itself applies.
  useEffect(() => {
    if (!tracker) {
      setDiaryEntries([]);
      return;
    }
    fetchDiaryEntries(tracker.id)
      .then((entries) => setDiaryEntries(entries))
      .catch(() => setDiaryEntries([]));
  }, [tracker]);

  // The existing DiseaseRiskRule-backed risk-alerts endpoint (Task 12/13),
  // narrowed to this one crop -- see findRiskAlertForCrop above.
  useEffect(() => {
    fetchRiskAlerts()
      .then((data) => setRiskAlert(findRiskAlertForCrop(data, cropId)))
      .catch(() => setRiskAlert(null));
  }, [cropId]);

  const latestScan = scans[0] || null;
  const status = deriveHealthStatus({ latestScan, hasActiveRiskAlert: !!riskAlert });

  return { loading, tracker, scans, latestScan, diaryEntries, riskAlert, status };
}
