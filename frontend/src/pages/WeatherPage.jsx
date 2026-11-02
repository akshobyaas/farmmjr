import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useWeather } from "../hooks/useWeather";
import AppHeader from "../components/AppHeader";
import BottomNav from "../components/BottomNav";
import styles from "./WeatherPage.module.css";

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

// The backend returns real ISO-8601 timestamps/dates (see weather/views.py's
// _to_iso_utc), so these are thin presentation wrappers, not new parsing
// logic -- `undefined` locale means "the browser's own locale", same
// convention ScanHistoryPage/VideosPage already use for dates.
function formatHour(isoString) {
  return new Date(isoString).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}
function formatWeekday(dateString) {
  // Parsed as UTC midnight (not local midnight) so the weekday shown always
  // matches the calendar date the backend grouped by, regardless of the
  // viewer's own timezone offset.
  return new Date(`${dateString}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "short" });
}

export default function WeatherPage() {
  const { t } = useTranslation();
  const { cityInput, setCityInput, weather, forecast, loading, error, handleCitySubmit, handleUseMyLocation } = useWeather();

  return (
    <div className="dashboard-page">
      <AppHeader title={t("weather.title")} className="weather-header" />

      <main className={`app-main ${styles["weather-main"]}`}>
        <form className={styles["weather-search-form"]} onSubmit={handleCitySubmit}>
          <div className={`field-box ${styles["weather-city-field"]}`}>
            <label htmlFor="weather-city" className="field-box-label">
              {t("locator.placeLabel")}
            </label>
            <input
              id="weather-city"
              type="text"
              placeholder={t("weather.placePlaceholder")}
              value={cityInput}
              onChange={(e) => setCityInput(e.target.value)}
              className="field-box-input"
            />
          </div>
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
          <div className={styles["weather-card"]}>
            <p className={styles["weather-location"]}>{weather.location}</p>
            <p className={styles["weather-icon"]}>{iconFor(weather.icon)}</p>
            {typeof weather.temperature === "number" && (
              <p className={styles["weather-temp"]}>{Math.round(weather.temperature)}°C</p>
            )}
            {weather.description && <p className={styles["weather-description"]}>{weather.description}</p>}
            {/* UI Polish Pass -- each reading now sits in its own stat-tile
                (shared.css), but keeps using the existing fully-interpolated
                translation strings (e.g. "Feels like 27°C") as a single
                stat-tile-value rather than splitting label/value, so every
                locale's existing copy (en/hi/kn) keeps working unchanged. */}
            <div className={styles["weather-meta"]}>
              {typeof weather.feels_like === "number" && (
                <span className={styles["weather-meta-chip"]}>
                  <span className={styles["weather-meta-icon"]} aria-hidden="true">🌡️</span>
                  <span className="stat-tile-value">
                    {t("weather.feelsLike", { temp: Math.round(weather.feels_like) })}
                  </span>
                </span>
              )}
              {typeof weather.humidity === "number" && (
                <span className={styles["weather-meta-chip"]}>
                  <span className={styles["weather-meta-icon"]} aria-hidden="true">💧</span>
                  <span className="stat-tile-value">{t("weather.humidity", { value: weather.humidity })}</span>
                </span>
              )}
              {typeof weather.wind_speed === "number" && (
                <span className={styles["weather-meta-chip"]}>
                  <span className={styles["weather-meta-icon"]} aria-hidden="true">💨</span>
                  <span className="stat-tile-value">{t("weather.wind", { value: weather.wind_speed })}</span>
                </span>
              )}
            </div>
          </div>
        )}

        {/* Mockup-inspired "Today" hourly strip and upcoming-days list --
            best-effort enhancements on top of the main reading above: if
            the forecast fetch failed, forecast is null and these two
            sections just don't render (useWeather.js already isolates a
            forecast failure from the main weather result). */}
        {!loading && !error && forecast?.hourly?.length > 0 && (
          <div className={styles["hourly-section"]}>
            <h2 className={styles["forecast-section-title"]}>{t("weather.todayTitle")}</h2>
            <div className={styles["hourly-strip"]}>
              {forecast.hourly.map((slot) => (
                <div className={styles["hourly-chip"]} key={slot.time}>
                  <span className={styles["hourly-time"]}>{formatHour(slot.time)}</span>
                  <span className={styles["hourly-icon"]} aria-hidden="true">{iconFor(slot.icon)}</span>
                  <span className={styles["hourly-temp"]}>{Math.round(slot.temperature)}°</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading && !error && forecast?.daily?.length > 0 && (
          <div className={styles["daily-section"]}>
            <h2 className={styles["forecast-section-title"]}>{t("weather.forecastTitle")}</h2>
            <div className={styles["daily-list"]}>
              {forecast.daily.map((day) => (
                <div className={styles["daily-row"]} key={day.date}>
                  <span className={styles["daily-day"]}>{formatWeekday(day.date)}</span>
                  <span className={styles["daily-icon"]} aria-hidden="true">{iconFor(day.icon)}</span>
                  <span className={styles["daily-desc"]}>{day.description}</span>
                  <span className={styles["daily-temps"]}>
                    <span className={styles["daily-temp-max"]}>{Math.round(day.temp_max)}°</span>
                    <span className={styles["daily-temp-min"]}>{Math.round(day.temp_min)}°</span>
                  </span>
                </div>
              ))}
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
