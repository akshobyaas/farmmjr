import { useState } from "react";
import { Link } from "react-router-dom";
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
        setError(err.response?.data?.detail || "Nearby services are unavailable right now. Please try again later.");
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
      setError("Your browser doesn't support location detection. Please type a place name instead.");
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
        setError("Location permission denied. Please type a place name instead.");
      }
    );
  };

  return (
    <div className="dashboard-page">
      <AppHeader icon="📍" title="Nearby Services" className="locator-header" />

      <main className="app-main">
        <form className="locator-search-form" onSubmit={handlePlaceSubmit}>
          <label htmlFor="locator-place" className="sr-only">
            Place name
          </label>
          <input
            id="locator-place"
            type="text"
            placeholder="Enter a place name (e.g. Puttur, Dakshina Kannada)"
            value={placeInput}
            onChange={(e) => setPlaceInput(e.target.value)}
            className="locator-place-input"
          />
          <button type="submit" className="btn-primary" disabled={loading || !placeInput.trim()}>
            Search
          </button>
        </form>

        <button type="button" className="btn-secondary" onClick={handleUseMyLocation} disabled={loading}>
          📍 Use My Location
        </button>

        {loading && <p className="status-message">Finding nearby services…</p>}
        {error && <p className="form-error" role="alert">{error}</p>}

        {!loading && !error && searched && results && results.length === 0 && (
          <p className="status-message">
            No agricultural services found nearby. Try a different place name, or a nearby town.
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
                List
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={view === "map"}
                className={`locator-toggle-btn ${view === "map" ? "locator-toggle-active" : ""}`}
                onClick={() => setView("map")}
              >
                Map
              </button>
            </div>

            {view === "list" && (
              <div className="locator-list">
                {results.map((service) => (
                  <div key={service.id} className="locator-card">
                    <p className="locator-card-name">{service.name}</p>
                    <p className="locator-card-category">{service.category}</p>
                    <p className="locator-card-meta">
                      {service.distance_km} km away{service.address && ` · ${service.address}`}
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
                    <Popup>Your location</Popup>
                  </Marker>
                  {results.map((service) => (
                    <Marker key={service.id} position={[service.lat, service.lon]} icon={defaultIcon}>
                      <Popup>
                        <strong>{service.name}</strong>
                        <br />
                        {service.category}
                        <br />
                        {service.distance_km} km away
                      </Popup>
                    </Marker>
                  ))}
                </MapContainer>
              </div>
            )}
          </>
        )}

        <p className="auth-switch">
          <Link to="/dashboard">Back to Dashboard</Link>
        </p>
      </main>
      <BottomNav />
    </div>
  );
}
