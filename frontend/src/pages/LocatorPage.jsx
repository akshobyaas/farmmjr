import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { fetchNearbyServices } from "../api/locator";
import AppHeader from "../components/AppHeader";
import BottomNav from "../components/BottomNav";

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
  className: "locator-origin-marker",
});

export default function LocatorPage() {
  const { t } = useTranslation();
  const [placeInput, setPlaceInput] = useState("");
  const [view, setView] = useState("list");
  const [origin, setOrigin] = useState(null);
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);

  const runSearch = (params) => {
    setLoading(true);
    setError("");
    setResults(null);
    setSearched(true);
    fetchNearbyServices(params)
      .then((data) => {
        setOrigin(data.origin);
        setResults(data.results);
      })
      .catch((err) => {
        setError(err.response?.data?.detail || t("locator.fetchError"));
      })
      .finally(() => setLoading(false));
  };

  const handlePlaceSubmit = (e) => {
    e.preventDefault();
    if (!placeInput.trim()) return;
    runSearch({ place: placeInput.trim() });
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
        runSearch({ lat: position.coords.latitude, lon: position.coords.longitude });
      },
      () => {
        setLoading(false);
        setError(t("common.geoDenied"));
      }
    );
  };

  return (
    <div className="dashboard-page">
      <AppHeader icon="📍" title={t("locator.title")} className="locator-header" />

      <main className="app-main">
        <form className="locator-search-form" onSubmit={handlePlaceSubmit}>
          <label htmlFor="locator-place" className="sr-only">
            {t("locator.placeLabel")}
          </label>
          <input
            id="locator-place"
            type="text"
            placeholder={t("locator.placePlaceholder")}
            value={placeInput}
            onChange={(e) => setPlaceInput(e.target.value)}
            className="locator-place-input"
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
            <div className="locator-view-toggle" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={view === "list"}
                className={`locator-toggle-btn ${view === "list" ? "locator-toggle-active" : ""}`}
                onClick={() => setView("list")}
              >
                {t("locator.viewList")}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={view === "map"}
                className={`locator-toggle-btn ${view === "map" ? "locator-toggle-active" : ""}`}
                onClick={() => setView("map")}
              >
                {t("locator.viewMap")}
              </button>
            </div>

            {view === "list" && (
              <div className="locator-list">
                {results.map((service) => (
                  <div key={service.id} className="locator-card">
                    <p className="locator-card-name">{service.name}</p>
                    <p className="locator-card-category">{service.category}</p>
                    <p className="locator-card-meta">
                      {t("locator.kmAway", { km: service.distance_km })}
                      {service.address && ` · ${service.address}`}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {view === "map" && origin && (
              <div className="locator-map-wrap">
                <MapContainer
                  center={[origin.lat, origin.lon]}
                  zoom={12}
                  scrollWheelZoom={false}
                  className="locator-map"
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
