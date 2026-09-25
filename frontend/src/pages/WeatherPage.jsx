import { useState } from "react";
import { Link } from "react-router-dom";
import { fetchWeather } from "../api/weather";

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
      setError(err.response?.data?.detail || "Weather unavailable right now. Please try again later.");
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
      setError("Your browser doesn't support location detection. Please type a place name instead.");
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
        setError("Location permission denied. Please type a place name instead.");
      }
    );
  };

  return (
    <div className="dashboard-page">
      <header className="app-header weather-header">
        <span className="app-header-icon">🌦️</span>
        <h1>Weather</h1>
      </header>

      <main className="app-main">
        <form className="weather-search-form" onSubmit={handleCitySubmit}>
          <label htmlFor="weather-city" className="sr-only">
            Place name
          </label>
          <input
            id="weather-city"
            type="text"
            placeholder="Enter a place name (e.g. Mangaluru)"
            value={cityInput}
            onChange={(e) => setCityInput(e.target.value)}
            className="weather-city-input"
          />
          <button type="submit" className="btn-primary" disabled={loading || !cityInput.trim()}>
            Search
          </button>
        </form>

        <button type="button" className="btn-secondary" onClick={handleUseMyLocation} disabled={loading}>
          📍 Use My Location
        </button>

        {loading && <p className="status-message">Loading weather…</p>}
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
                <span>Feels like {Math.round(weather.feels_like)}°C</span>
              )}
              {typeof weather.humidity === "number" && <span>Humidity {weather.humidity}%</span>}
              {typeof weather.wind_speed === "number" && <span>Wind {weather.wind_speed} m/s</span>}
            </div>
          </div>
        )}

        <p className="auth-switch">
          <Link to="/dashboard">Back to Dashboard</Link>
        </p>
      </main>
    </div>
  );
}
