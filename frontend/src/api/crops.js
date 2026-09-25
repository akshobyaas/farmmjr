import api from "./axios";

// Crop browsing is public backend-side (no auth required), so these calls
// work whether or not the user is logged in. Kept separate from AuthContext
// since crop data isn't auth state — it doesn't belong there.

export async function fetchCrops(search = "") {
  const params = search ? { search } : {};
  const { data } = await api.get("crops/", { params });
  return data;
}

export async function fetchCropDetail(id) {
  const { data } = await api.get(`crops/${id}/`);
  return data;
}
