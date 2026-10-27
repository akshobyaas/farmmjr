import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useRegisterForm } from "../hooks/useRegisterForm";
import PasswordInput from "../components/PasswordInput";
import LanguageSwitcher from "../components/LanguageSwitcher";
import { LANGUAGES } from "../i18n/languages";
import logo from "../assets/logo.png";
import styles from "./RegisterPage.module.css";

export default function RegisterPage() {
  const { t } = useTranslation();
  const { form, error, submitting, hints, handleChange, handleSubmit } = useRegisterForm();

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-lang-row">
          <LanguageSwitcher />
        </div>
        <img src={logo} alt={t("common.appName")} className="auth-logo" />
        <h1 className="auth-title">{t("register.title")}</h1>
        <p className="auth-subtitle">{t("register.subtitle")}</p>

        <form onSubmit={handleSubmit} noValidate>
          <label className="form-label" htmlFor="username">{t("register.username")}</label>
          <input
            id="username" name="username" type="text" className="form-input"
            value={form.username} onChange={handleChange} autoComplete="username" required
          />
          <p className="field-hint">{t("register.usernameHint")}</p>

          <label className="form-label" htmlFor="email">{t("register.email")}</label>
          <input
            id="email" name="email" type="email" className="form-input"
            value={form.email} onChange={handleChange} autoComplete="email" required
          />

          <label className="form-label" htmlFor="password">{t("register.password")}</label>
          <PasswordInput
            id="password" name="password"
            value={form.password} onChange={handleChange} autoComplete="new-password" required
          />
          {form.password.length > 0 && (
            <ul className={styles["password-hints"]}>
              <li className={hints.minLength ? "hint-ok" : "hint-pending"}>
                {hints.minLength ? "✓" : "○"} {t("register.passwordHintLength")}
              </li>
              <li className={hints.notAllNumeric ? "hint-ok" : "hint-pending"}>
                {hints.notAllNumeric ? "✓" : "○"} {t("register.passwordHintNotNumeric")}
              </li>
            </ul>
          )}

          <label className="form-label" htmlFor="password_confirm">{t("register.confirmPassword")}</label>
          <PasswordInput
            id="password_confirm" name="password_confirm"
            value={form.password_confirm} onChange={handleChange} autoComplete="new-password" required
          />

          <label className="form-label" htmlFor="preferred_language">{t("register.preferredLanguage")}</label>
          <select
            id="preferred_language" name="preferred_language" className="form-input"
            value={form.preferred_language} onChange={handleChange}
          >
            {LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>{lang.full}</option>
            ))}
          </select>

          {error && <p className="form-error" role="alert">{error}</p>}

          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? t("register.submitting") : t("register.submit")}
          </button>
        </form>

        <p className="auth-switch">
          {t("register.haveAccount")} <Link to="/login">{t("register.loginHere")}</Link>
        </p>
      </div>
    </div>
  );
}
