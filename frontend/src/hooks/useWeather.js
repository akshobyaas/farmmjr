import { useState } from "react";
import { useTranslation } from "react-i18next";
import { fetchWeather, fetchForecast } from "../api/weather";
import { recentLocationsStorage } from "./recentLocationsStorage";

// Extracted verbatim from WeatherPage.jsx's state/handlers, as part of the
// frontend structure cleanup (Sub-project 1). See
// FRONTEND_REFACTOR_IMPLEMENTATION_PLAN.md Task 7. iconFor() stays in the
// page -- pure presentation, not data-fetching.
export function useWeather() {
  const { t } = useTranslation();
  const [cityInput, setCityInput] = useState("");
  const [weather, setWeather] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Weather page design pass (pre-search screen) -- recent-search chips.
  // Lazily read from localStorage once on mount, via recentLocationsStorage.
  const [recentLocations, setRecentLocations] = useState(() => recentLocationsStorage.get());

  const runFetch = async (params) => {
    setLoading(true);
    setError("");
    setWeather(null);
    setForecast(null);
    try {
      const data = await fetchWeather(params);
      setWeather(data);
      // Only a typed city search is worth remembering -- it's the one case
      // the farmer could actually retype later. A geolocation lookup has
      // no place name here to save (params.city is undefined for it).
      if (params.city) {
        setRecentLocations(recentLocationsStorage.add(params.city));
      }
      // The hourly/daily strip is an enhancement on top of the main
      // reading, not core -- if it fails, the farmer still gets today's
      // weather, just without the "Today"/upcoming-days sections.
      try {
        setForecast(await fetchForecast(params));
      } catch {
        setForecast(null);
      }
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

  // Recent-location chip click -- same as typing the place and hitting
  // Search, so it goes through the same remembering/forecast/error path.
  const selectRecentLocation = (city) => {
    setCityInput(city);
    return runFetch({ city });
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

  return {
    cityInput,
    setCityInput,
    weather,
    forecast,
    loading,
    error,
    handleCitySubmit,
    handleUseMyLocation,
    recentLocations,
    selectRecentLocation,
  };
}
