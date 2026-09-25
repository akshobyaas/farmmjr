import api from "./axios";

// The backend proxies OpenWeatherMap (key stays server-side). Pass EITHER
// { lat, lon } (from the browser's geolocation) OR { city } (manual entry).
export async function fetchWeather({ lat, lon, city } = {}) {
  const params = city ? { city } : { lat, lon };
  const { data } = await api.get("weather/", { params });
  return data;
}
