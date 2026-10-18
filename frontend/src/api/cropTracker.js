import api from "./axios";

// Task 6 (USP crop tracker) -- thin wrappers over the ownership-scoped
// GET/POST /crops/trackers/ + PATCH /crops/trackers/<id>/ endpoints (Task 5).
// Kept separate from api/crops.js the same way api/advisory.js is kept
// separate from the rest of the crop-guidance reads: this is farmer-owned
// state, not public crop catalog data.

export async function fetchTrackers() {
  const { data } = await api.get("crops/trackers/");
  return data;
}

export async function createTracker({ cropId, plantingDate, currentStage }) {
  const payload = { crop: cropId };
  if (plantingDate) payload.planting_date = plantingDate;
  // Explicit override for month-based crops (no planting date to derive
  // from) -- the backend's FarmerCropTrackerSerializer already accepts
  // current_stage on create (Task 5) and skips derivation when it's
  // present in the request body, so this is a single atomic call rather
  // than create-then-update.
  if (currentStage != null) payload.current_stage = currentStage;
  const { data } = await api.post("crops/trackers/", payload);
  return data;
}

export async function updateTracker(id, fields) {
  const { data } = await api.patch(`crops/trackers/${id}/`, fields);
  return data;
}

// Task 13 -- thin wrapper over GET /crops/risk-alerts/ (Task 12), same
// style as the wrappers above. The endpoint always resolves 200 with one
// of three shapes: {"trackers": []} (no active tracker), {"detail": ...}
// (active tracker(s) but no home_location set yet), or {"trackers": [...]}
// with each tracker's own risk_alerts list -- interpreting that shape is
// left to the caller (DashboardPage), same division of responsibility as
// the other wrappers here.
export async function fetchRiskAlerts() {
  const { data } = await api.get("crops/risk-alerts/");
  return data;
}

// Task 18 -- thin wrapper over GET /crops/tasks/today/ (Task 17), same
// style as the wrappers above. Always resolves 200 with {"tasks": [...]}
// (an empty array when there's nothing for today) -- no error shape to
// interpret here, unlike fetchRiskAlerts.
export async function fetchTodaysTasks() {
  const { data } = await api.get("crops/tasks/today/");
  return data;
}
