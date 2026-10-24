import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useCropList } from "../hooks/useCropList";
import { localizeField } from "../i18n/localize";
import AppHeader from "../components/AppHeader";
import BottomNav from "../components/BottomNav";
import styles from "./CropListPage.module.css";

export default function CropListPage() {
  const { t, i18n } = useTranslation();
  const { crops, search, setSearch, loading, error, handleSearchSubmit } = useCropList();

  return (
    <div className="dashboard-page">
      <AppHeader title={t("crops.title")} />

      <main className="app-main">
        <form onSubmit={handleSearchSubmit} className={styles["crop-search-form"]}>
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

        <div className={styles["crop-grid"]}>
          {crops.map((crop) => (
            <Link key={crop.id} to={`/crops/${crop.id}`} className={styles["crop-card"]}>
              <h3 className={styles["crop-card-name"]}>{localizeField(crop, "name", i18n.language)}</h3>
              <div className={styles["crop-card-tags"]}>
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
