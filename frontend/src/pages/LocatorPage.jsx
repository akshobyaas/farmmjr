import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useLocatorSearch } from "../hooks/useLocatorSearch";
import AppHeader from "../components/AppHeader";
import BottomNav from "../components/BottomNav";
import Icon from "../components/Icon";
import styles from "./LocatorPage.module.css";

// react-leaflet's default marker icon references image paths that don't
// resolve correctly once bundled by Vite -- pointing it at the same
// version's CDN-hosted icons is the standard, documented workaround.
const defaultIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
const originIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
  className: styles["locator-origin-marker"],
});

export default function LocatorPage() {
  const { t } = useTranslation();
  const [view, setView] = useState("list");
  const {
    placeInput,
    setPlaceInput,
    origin,
    results,
    loading,
    error,
    searched,
    handlePlaceSubmit,
    handleUseMyLocation,
  } = useLocatorSearch();

  return (
    <div className="dashboard-page">
      <AppHeader title={t("locator.title")} className="locator-header" />

      <main className="app-main">
        {/* Pre-search intro, matching WeatherPage's "location discovery"
            state -- same icon/eyebrow/heading/body structure, this page's
            own copy. Hidden once a search has been attempted (searched
            flips true on submit, same as weather hides its intro once a
            reading is on screen) so it doesn't compete with results. */}
        {!searched && (
          <div className={styles["locator-intro"]}>
            <Icon name="pin" size={32} className={styles["locator-intro-icon"]} />
            <p className={styles["locator-intro-eyebrow"]}>{t("locator.introEyebrow")}</p>
            <h2 className={styles["locator-intro-heading"]}>{t("locator.introHeading")}</h2>
            <p className={styles["locator-intro-body"]}>{t("locator.introBody")}</p>
          </div>
        )}

        {/* Search card restyle -- same merged pill-shaped bar + circular
            icon-only submit button as WeatherPage's search-card/search-pill,
            instead of the old boxed-label field-box beside a separate
            rectangular Search button. The field's accessible label moves to
            a visually-hidden <label> (shared.css's .sr-only), same as
            Weather. */}
        <div className={styles["search-card"]}>
          <label htmlFor="locator-place" className="sr-only">
            {t("locator.placeLabel")}
          </label>
          <form className={styles["search-pill"]} onSubmit={handlePlaceSubmit}>
            <input
              id="locator-place"
              type="text"
              placeholder={t("locator.placePlaceholder")}
              value={placeInput}
              onChange={(e) => setPlaceInput(e.target.value)}
              className={styles["search-pill-input"]}
            />
            {placeInput && (
              <button
                type="button"
                className={styles["search-clear-btn"]}
                onClick={() => setPlaceInput("")}
                aria-label={t("common.clear")}
              >
                <Icon name="close" size={14} />
              </button>
            )}
            <button
              type="submit"
              className={styles["search-pill-submit"]}
              disabled={loading || !placeInput.trim()}
              aria-label={t("common.search")}
            >
              <Icon name="search" size={18} />
            </button>
          </form>
        </div>

        {/* Use My Location restyle -- WeatherPage's outlined pill with an
            inline icon, instead of the plain btn-secondary. New
            locator.useMyLocation string without the baked-in emoji (same
            precedent WeatherPage set for weather.useMyLocation); the old
            common.useMyLocation key is left as-is, now unused here. */}
        <button
          type="button"
          className={styles["use-location-btn"]}
          onClick={handleUseMyLocation}
          disabled={loading}
        >
          <Icon name="myLocation" size={18} className={styles["use-location-icon"]} />
          {t("locator.useMyLocation")}
        </button>

        {loading && <p className="status-message">{t("locator.loading")}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}

        {!loading && !error && searched && results && results.length === 0 && (
          <p className="status-message">
            {t("locator.noResults")}
          </p>
        )}

        {!loading && !error && results && results.length > 0 && (
          <>
            <div className={styles["locator-view-toggle"]} role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={view === "list"}
                className={`${styles["locator-toggle-btn"]} ${view === "list" ? styles["locator-toggle-active"] : ""}`}
                onClick={() => setView("list")}
              >
                {t("locator.viewList")}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={view === "map"}
                className={`${styles["locator-toggle-btn"]} ${view === "map" ? styles["locator-toggle-active"] : ""}`}
                onClick={() => setView("map")}
              >
                {t("locator.viewMap")}
              </button>
            </div>

            {view === "list" && (
              <div className={styles["locator-list"]}>
                {results.map((service) => (
                  <div key={service.id} className="list-row">
                    <span className="list-row-icon" aria-hidden="true">
                      <Icon name="pin" size={20} />
                    </span>
                    <span className="list-row-text">
                      <span className="list-row-title">{service.name}</span>
                      <span className="list-row-subtitle">
                        {service.category} · {t("locator.kmAway", { km: service.distance_km })}
                        {service.address && ` · ${service.address}`}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            )}

            {view === "map" && origin && (
              <div className={styles["locator-map-wrap"]}>
                <MapContainer
                  center={[origin.lat, origin.lon]}
                  zoom={12}
                  scrollWheelZoom={false}
                  className={styles["locator-map"]}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <Marker position={[origin.lat, origin.lon]} icon={originIcon}>
                    <Popup>{t("locator.yourLocation")}</Popup>
                  </Marker>
                  {results.map((service) => (
                    <Marker key={service.id} position={[service.lat, service.lon]} icon={defaultIcon}>
                      <Popup>
                        <strong>{service.name}</strong>
                        <br />
                        {service.category}
                        <br />
                        {t("locator.kmAway", { km: service.distance_km })}
                      </Popup>
                    </Marker>
                  ))}
                </MapContainer>
              </div>
            )}
          </>
        )}

        <p className="auth-switch">
          <Link to="/dashboard">{t("common.backToDashboard")}</Link>
        </p>
      </main>
      <BottomNav />
    </div>
  );
}
