import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { fetchCrops } from "../api/crops";
import { localizeField } from "../i18n/localize";
import AppHeader from "../components/AppHeader";
import Icon from "../components/Icon";
import BottomNav from "../components/BottomNav";

export default function CropListPage() {
  const { t, i18n } = useTranslation();
  const [crops, setCrops] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadCrops = useCallback((query) => {
    setLoading(true);
    setError("");
    fetchCrops(query)
      .then((data) => setCrops(data))
      .catch(() => setError(t("crops.cropsLoadError")))
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => {
    loadCrops("");
  }, [loadCrops]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadCrops(search);
  };

  return (
    <div className="dashboard-page">
      <AppHeader icon={<Icon name="leaf" />} title={t("crops.title")} />

      <main className="app-main">
        <form onSubmit={handleSearchSubmit} className="crop-search-form">
          <input
            type="text"
            className="form-input"
            placeholder={t("crops.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button type="submit" className="btn-secondary">{t("crops.searchButton")}</button>
        </form>

        {loading && <p className="status-message">{t("crops.loadingCrops")}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}

        {!loading && !error && crops.length === 0 && (
          <p className="status-message">{t("crops.noCropsFound")}</p>
        )}

        <div className="crop-grid">
          {crops.map((crop) => (
            <Link key={crop.id} to={`/crops/${crop.id}`} className="crop-card">
              <h3 className="crop-card-name">{localizeField(crop, "name", i18n.language)}</h3>
              <div className="crop-card-tags">
                <span className="chip">🌱 {localizeField(crop, "soil_type", i18n.language)}</span>
                <span className="chip">☀️ {localizeField(crop, "climate", i18n.language)}</span>
              </div>
            </Link>
          ))}
        </div>

        <p className="auth-switch">
          <Link to="/dashboard">{t("common.backToDashboard")}</Link>
        </p>
      </main>
      <BottomNav />
    </div>
  );
}
