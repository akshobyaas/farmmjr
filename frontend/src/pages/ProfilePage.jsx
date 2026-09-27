import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import AppHeader from "../components/AppHeader";
import Icon from "../components/Icon";
import BottomNav from "../components/BottomNav";

export default function ProfilePage() {
  const { getProfile, updateProfile } = useAuth();
  const { t, i18n } = useTranslation();

  const [form, setForm] = useState(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    getProfile()
      .then((data) => setForm(data))
      .catch(() => setError("Could not load your profile. Please try again."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChange = (e) => {
    setSuccess(false);
    setForm({ ...form, [e.target.name]: e.target.value });
    // Phase 18 -- preview the language switch live as soon as it's picked,
    // before "Save Changes" persists it to the backend. Saving (below)
    // updates AuthContext's `user`, which re-applies this same language on
    // every future login/session-restore.
    if (e.target.name === "preferred_language") {
      i18n.changeLanguage(e.target.value);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess(false);
    setSubmitting(true);
    try {
      await updateProfile({
        first_name: form.first_name,
        last_name: form.last_name,
        phone_number: form.phone_number,
        preferred_language: form.preferred_language,
      });
      setSuccess(true);
    } catch {
      setError("Could not save your changes. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!form && !error) {
    return <div className="loading-screen">{t("common.loading")}</div>;
  }

  // Phase 21 -- Profile used to be the one protected page still styled like
  // a logged-out auth screen (centered card, no header, no nav): it now
  // shares the same header + bottom-nav shell as every other logged-in
  // page, for a consistent experience.
  return (
    <div className="dashboard-page">
      <AppHeader icon={<Icon name="user" />} title={t("profile.title")} />

      <main className="app-main">
        <div className="status-card profile-card">
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

              <label className="form-label" htmlFor="preferred_language">{t("profile.preferredLanguage")}</label>
              <select
                id="preferred_language" name="preferred_language" className="form-input"
                value={form.preferred_language} onChange={handleChange}
              >
                <option value="en">English</option>
                <option value="kn">ಕನ್ನಡ (Kannada)</option>
                <option value="hi">हिन्दी (Hindi)</option>
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
