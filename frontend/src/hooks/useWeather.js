import { useState } from "react";
import { useTranslation } from "react-i18next";
import { fetchWeather } from "../api/weather";

// Extracted verbatim from WeatherPage.jsx's state/handlers, as part of the
// frontend structure cleanup (Sub-project 1). See
// FRONTEND_REFACTOR_IMPLEMENTATION_PLAN.md Task 7. iconFor() stays in the
// page -- pure presentation, not data-fetching.
export function useWeather() {
  const { t } = useTranslation();
  const [cityInput, setCityInput] = useState("");
  const [weather, setWeather] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const runFetch = async (params) => {
    setLoading(true);
    setError("");
    setWeather(null);
    try {
      const data = await fetchWeather(params);
      setWeather(data);
    } catch (err) {
      setError(err.response?.data?.detail || t("weather.fetchError"));
    } finally {
      setLoading(false);
    }
  };

  const handleCitySubmit = (e) => {
    e.preventDefault();
    if (!cityInput.trim()) return;
    return runFetch({ city: cityInput.trim() });
  };

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setError(t("common.geoUnsupported"));
      return;
    }
    setLoading(true);
    setError("");
    // The browser itself shows the permission prompt here -- we never
    // access location silently.
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve(runFetch({ lat: position.coords.latitude, lon: position.coords.longitude }));
        },
        () => {
          setLoading(false);
          setError(t("common.geoDenied"));
          resolve();
        }
      );
    });
  };

  return { cityInput, setCityInput, weather, loading, error, handleCitySubmit, handleUseMyLocation };
}
