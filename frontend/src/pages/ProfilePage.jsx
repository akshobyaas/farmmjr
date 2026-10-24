import { useTranslation } from "react-i18next";
import { useProfileForm } from "../hooks/useProfileForm";
import AppHeader from "../components/AppHeader";
import BottomNav from "../components/BottomNav";
import { LANGUAGES } from "../i18n/languages";
import styles from "./ProfilePage.module.css";

export default function ProfilePage() {
  const { t } = useTranslation();
  const { form, error, success, submitting, handleChange, handleSubmit } = useProfileForm();

  if (!form && !error) {
    return <div className="loading-screen">{t("common.loading")}</div>;
  }

  // Phase 21 -- Profile used to be the one protected page still styled like
  // a logged-out auth screen (centered card, no header, no nav): it now
  // shares the same header + bottom-nav shell as every other logged-in
  // page, for a consistent experience.
  return (
    <div className="dashboard-page">
      <AppHeader title={t("profile.title")} />

      <main className="app-main">
        <div className={`status-card ${styles["profile-card"]}`}>
          <p className="auth-subtitle">{form?.username}</p>

          {form && (
            <form onSubmit={handleSubmit} noValidate>
              <label className="form-label" htmlFor="first_name">{t("profile.firstName")}</label>
              <input
                id="first_name" name="first_name" type="text" className="form-input"
                value={form.first_name} onChange={handleChange}
              />

              <label className="form-label" htmlFor="last_name">{t("profile.lastName")}</label>
              <input
                id="last_name" name="last_name" type="text" className="form-input"
                value={form.last_name} onChange={handleChange}
              />

              <label className="form-label" htmlFor="phone_number">{t("profile.phoneNumber")}</label>
              <input
                id="phone_number" name="phone_number" type="tel" className="form-input"
                value={form.phone_number} onChange={handleChange}
              />

              <label className="form-label" htmlFor="home_location">{t("profile.homeLocation")}</label>
              <input
                id="home_location" name="home_location" type="text" className="form-input"
                value={form.home_location} onChange={handleChange}
              />

              <label className="form-label" htmlFor="preferred_language">{t("profile.preferredLanguage")}</label>
              <select
                id="preferred_language" name="preferred_language" className="form-input"
                value={form.preferred_language} onChange={handleChange}
              >
                {LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>{lang.full}</option>
                ))}
              </select>

              <p className="form-label" style={{ marginTop: 20, color: "var(--color-text-secondary)" }}>
                {t("profile.emailNote", { email: form.email })}
              </p>

              {error && <p className="form-error" role="alert">{error}</p>}
              {success && (
                <div className="status-card status-ok" style={{ marginTop: 16 }}>
                  <p className="status-message">✅ Profile updated successfully.</p>
                </div>
              )}

              <button type="submit" className="btn-primary" disabled={submitting}>
                {submitting ? t("common.saving") : t("common.save")}
              </button>
            </form>
          )}
          {error && !form && <p className="form-error" role="alert">{error}</p>}
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
