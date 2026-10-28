import api from "./axios";

// The backend proxies OpenStreetMap's Nominatim (geocoding) and Overpass
// (nearby POI search) -- no API key involved on either side. Pass EITHER
// { lat, lon } (from the browser's geolocation) OR { place } (manual entry).
//
// Bug fix: the shared `api` axios instance has an 8-second default timeout,
// sized for normal fast endpoints. This one call's backend view
// (NearbyServicesView) can legitimately take far longer in its worst case:
// up to 10s geocoding with Nominatim (place search only) plus up to two
// Overpass mirror attempts at up to 20s each (OVERPASS_REQUEST_TIMEOUT_SECONDS
// on the backend) -- around 50 real seconds it may still be working. With
// the 8s default, axios was aborting the connection well before the
// backend's own fallback logic had a chance to finish, which live backend
// logs confirmed ("Broken pipe" right as the backend finally tried to send
// its response). This override gives this one call enough patience to
// actually benefit from the backend's retry/fallback instead of failing
// out from under it every time.
const NEARBY_SERVICES_TIMEOUT_MS = 55000;

export async function fetchNearbyServices({ lat, lon, place } = {}) {
  const params = place ? { place } : { lat, lon };
  const { data } = await api.get("locator/nearby/", { params, timeout: NEARBY_SERVICES_TIMEOUT_MS });
  return data;
}
