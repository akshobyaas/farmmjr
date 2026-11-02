import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useWeather } from "../hooks/useWeather";
import AppHeader from "../components/AppHeader";
import BottomNav from "../components/BottomNav";
import Icon from "../components/Icon";
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
  const {
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
  } = useWeather();

  return (
    <div className="dashboard-page">
      <AppHeader title={t("weather.title")} className="weather-header" />

      <main className={`app-main ${styles["weather-main"]}`}>
        {/* Pre-search intro -- design.md's "location discovery" state, kept
            in this page's existing design system (own tokens/icons/font,
            no new scenic imagery) rather than adopting that spec's new
            visual language. Hidden once a reading is on screen so it
            doesn't compete with the weather card below. */}
        {!weather && (
          <div className={styles["weather-intro"]}>
            <Icon name="cloudSun" size={32} className={styles["weather-intro-icon"]} />
            <p className={styles["weather-intro-eyebrow"]}>{t("weather.introEyebrow")}</p>
            <h2 className={styles["weather-intro-heading"]}>{t("weather.introHeading")}</h2>
            <p className={styles["weather-intro-body"]}>{t("weather.introBody")}</p>
          </div>
        )}

        {/* Search card restyle (user-supplied reference mockup) -- a single
            rounded card (label row + one merged pill-shaped search bar with
            an inline circular submit button) instead of the previous
            boxed-label field-box beside a separate rectangular Search
            button. Still the app's own green/white tokens and existing
            font throughout -- only the shape/icon/layout changed, per the
            user's explicit "keep current colors" direction. */}
        <div className={styles["search-card"]}>
          <label htmlFor="weather-city" className={styles["search-card-label-row"]}>
            <Icon name="pin" size={16} className={styles["search-card-label-icon"]} />
            <span className={styles["search-card-label"]}>{t("locator.placeLabel")}</span>
          </label>
          <form className={styles["search-pill"]} onSubmit={handleCitySubmit}>
            <input
              id="weather-city"
              type="text"
              placeholder={t("weather.placePlaceholder")}
              value={cityInput}
              onChange={(e) => setCityInput(e.target.value)}
              className={styles["search-pill-input"]}
            />
            {/* design.md's LocationSearch component: "a clear action after
                text is entered." Only takes over cityInput -- it never
                clears the weather result that's already on screen, same
                as typing over the field and not resubmitting. */}
            {cityInput && (
              <button
                type="button"
                className={styles["search-clear-btn"]}
                onClick={() => setCityInput("")}
                aria-label={t("common.clear")}
              >
                <Icon name="close" size={14} />
              </button>
            )}
            <button
              type="submit"
              className={styles["search-pill-submit"]}
              disabled={loading || !cityInput.trim()}
              aria-label={t("common.search")}
            >
              <Icon name="search" size={18} />
            </button>
          </form>
        </div>

        {/* A plain, non-emoji weather.useMyLocation string (new key, kept
            separate from the shared common.useMyLocation used on
            LocatorPage) since the icon is now rendered for real via
            <Icon name="myLocation" /> -- stripping the emoji keeps this
            page's string from showing both at once, without touching
            LocatorPage's own untouched copy/behavior. */}
        <button
          type="button"
          className={styles["use-location-btn"]}
          onClick={handleUseMyLocation}
          disabled={loading}
        >
          <Icon name="myLocation" size={18} className={styles["use-location-icon"]} />
          {t("weather.useMyLocation")}
        </button>

        {/* Lightweight "recent searches" -- design.md's location chips,
            but backed by this app's own localStorage history (see
            hooks/recentLocationsStorage.js) instead of a hardcoded
            "popular cities" list, since the app has no such data. */}
        {!weather && recentLocations.length > 0 && (
          <div className={styles["recent-locations"]}>
            <p className={styles["recent-locations-label"]}>{t("weather.recentLabel")}</p>
            <div className={styles["recent-locations-row"]}>
              {recentLocations.map((city) => (
                <button
                  type="button"
                  key={city}
                  className={styles["recent-location-chip"]}
                  onClick={() => selectRecentLocation(city)}
                  disabled={loading}
                >
                  {city}
                </button>
              ))}
            </div>
          </div>
        )}

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
              {forecast.hourly.map((slot, index) => {
                // The backend already orders hourly entries chronologically
                // (weather/views.py's _build_hourly slices OpenWeatherMap's
                // own ordered list), so the first slot is always the
                // soonest -- the one highlight the mockup's blue "11:00"
                // card was going for, here in the app's own accent color.
                const isCurrent = index === 0;
                return (
                  <div
                    className={`${styles["hourly-chip"]} ${isCurrent ? styles["hourly-chip-current"] : ""}`}
                    data-current-hour={isCurrent}
                    key={slot.time}
                  >
                    <span className={styles["hourly-time"]}>{formatHour(slot.time)}</span>
                    <span className={styles["hourly-icon"]} aria-hidden="true">{iconFor(slot.icon)}</span>
                    <span className={styles["hourly-temp"]}>{Math.round(slot.temperature)}°</span>
                  </div>
                );
              })}
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
