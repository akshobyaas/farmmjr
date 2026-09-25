import api from "./axios";

// The backend proxies YouTube Data API v3 (key stays server-side) and
// caches recent searches briefly to save quota.
export async function searchVideos(query) {
  const { data } = await api.get("videos/search/", { params: { q: query } });
  return data;
}
