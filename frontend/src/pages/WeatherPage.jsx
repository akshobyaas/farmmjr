import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { fetchWeather } from "../api/weather";
import AppHeader from "../components/AppHeader";
import BottomNav from "../components/BottomNav";

// Simple, dependency-free mapping from OpenWeatherMap's icon code prefix to
// an emoji, since we don't want to pull in an icon font/library just for
// this. Covers every prefix OpenWeatherMap actually returns.
function iconFor(code) {
  const prefix = (code || "").slice(0, 2);
  const map = {
    "01": "☀️",
    "02": "🌤️",
    "03": "☁️",
    "04": "☁️",
    "09": "🌧️",
    "10": "🌦️",
    "11": "⛈️",
    "13": "❄️",
    "50": "🌫️",
  };
  return map[prefix] || "🌦️";
}

export default function WeatherPage() {
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
    runFetch({ city: cityInput.trim() });
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
    navigator.geolocation.getCurrentPosition(
      (position) => {
        runFetch({ lat: position.coords.latitude, lon: position.coords.longitude });
      },
      () => {
        setLoading(false);
        setError(t("common.geoDenied"));
      }
    );
  };

  return (
    <div className="dashboard-page">
      <AppHeader icon="🌦️" title={t("weather.title")} className="weather-header" />

      <main className="app-main">
        <form className="weather-search-form" onSubmit={handleCitySubmit}>
          <label htmlFor="weather-city" className="sr-only">
            {t("locator.placeLabel")}
          </label>
          <input
            id="weather-city"
            type="text"
            placeholder={t("weather.placePlaceholder")}
            value={cityInput}
            onChange={(e) => setCityInput(e.target.value)}
            className="weather-city-input"
          />
          <button type="submit" className="btn-primary" disabled={loading || !cityInput.trim()}>
            {t("common.search")}
          </button>
        </form>

        <button type="button" className="btn-secondary" onClick={handleUseMyLocation} disabled={loading}>
          {t("common.useMyLocation")}
        </button>

        {loading && <p className="status-message">{t("weather.loading")}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}

        {!loading && !error && weather && (
          <div className="weather-card">
            <p className="weather-location">{weather.location}</p>
            <p className="weather-icon">{iconFor(weather.icon)}</p>
            {typeof weather.temperature === "number" && (
              <p className="weather-temp">{Math.round(weather.temperature)}°C</p>
            )}
            {weather.description && <p className="weather-description">{weather.description}</p>}
            <div className="weather-meta">
              {typeof weather.feels_like === "number" && (
                <span>{t("weather.feelsLike", { temp: Math.round(weather.feels_like) })}</span>
              )}
              {typeof weather.humidity === "number" && (
                <span>{t("weather.humidity", { value: weather.humidity })}</span>
              )}
              {typeof weather.wind_speed === "number" && (
                <span>{t("weather.wind", { value: weather.wind_speed })}</span>
              )}
            </div>
          </div>
        )}

        <p className="auth-switch">
          <Link to="/dashboard">{t("common.backToDashboard")}</Link>
        </p>
      </main>
      <BottomNav />
    </div>
  );
}
