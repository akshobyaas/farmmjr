import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useLocatorSearch } from "../hooks/useLocatorSearch";
import AppHeader from "../components/AppHeader";
import BottomNav from "../components/BottomNav";
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
        <form className={styles["locator-search-form"]} onSubmit={handlePlaceSubmit}>
          <label htmlFor="locator-place" className="sr-only">
            {t("locator.placeLabel")}
          </label>
          <input
            id="locator-place"
            type="text"
            placeholder={t("locator.placePlaceholder")}
            value={placeInput}
            onChange={(e) => setPlaceInput(e.target.value)}
            className={styles["locator-place-input"]}
          />
          <button type="submit" className="btn-primary" disabled={loading || !placeInput.trim()}>
            {t("common.search")}
          </button>
        </form>

        <button type="button" className="btn-secondary" onClick={handleUseMyLocation} disabled={loading}>
          {t("common.useMyLocation")}
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
                  <div key={service.id} className={styles["locator-card"]}>
                    <p className={styles["locator-card-name"]}>{service.name}</p>
                    <p className={styles["locator-card-category"]}>{service.category}</p>
                    <p className={styles["locator-card-meta"]}>
                      {t("locator.kmAway", { km: service.distance_km })}
                      {service.address && ` · ${service.address}`}
                    </p>
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
