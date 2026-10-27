import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useCropList } from "../hooks/useCropList";
import { localizeField } from "../i18n/localize";
import AppHeader from "../components/AppHeader";
import BottomNav from "../components/BottomNav";
import Icon from "../components/Icon";
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

        <div className={styles["crop-list"]}>
          {crops.map((crop) => (
            <Link key={crop.id} to={`/crops/${crop.id}`} className="list-row">
              <span className="list-row-icon" aria-hidden="true">
                <Icon name="leaf" size={20} />
              </span>
              <span className="list-row-text">
                <span className="list-row-title">{localizeField(crop, "name", i18n.language)}</span>
                <span className="list-row-subtitle">
                  {localizeField(crop, "soil_type", i18n.language)} · {localizeField(crop, "climate", i18n.language)}
                </span>
              </span>
              <span className="list-row-chevron" aria-hidden="true">
                <Icon name="chevronRight" size={18} />
              </span>
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
