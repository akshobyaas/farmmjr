import api from "./axios";

// The backend proxies OpenStreetMap's Nominatim (geocoding) and Overpass
// (nearby POI search) -- no API key involved on either side. Pass EITHER
// { lat, lon } (from the browser's geolocation) OR { place } (manual entry).
export async function fetchNearbyServices({ lat, lon, place } = {}) {
  const params = place ? { place } : { lat, lon };
  const { data } = await api.get("locator/nearby/", { params });
  return data;
}
