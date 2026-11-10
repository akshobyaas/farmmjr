import api from "./axios";

// Uploading a scan needs multipart/form-data, not JSON — axios sets the
// correct multipart boundary header automatically once it sees a FormData
// body, so we don't set Content-Type by hand here.
export async function uploadScan(file) {
  const formData = new FormData();
  formData.append("image", file);
  const { data } = await api.post("scans/upload/", formData);
  return data;
}

// Phase 12 — paginated, most-recent-first, and (server-side) restricted to
// only the logged-in farmer's own scans. `crop` (Task 12, Crop Detail's
// "Recent scans for this crop") is an optional refinement, not required —
// axios drops an undefined param from the query string, so callers that
// don't pass it keep getting the unfiltered list exactly as before.
export async function fetchScanHistory(page = 1, crop) {
  const { data } = await api.get("scans/history/", { params: { page, crop } });
  return data;
}

export async function fetchScanDetail(id) {
  const { data } = await api.get(`scans/history/${id}/`);
  return data;
}
