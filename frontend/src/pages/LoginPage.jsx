import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useLoginForm } from "../hooks/useLoginForm";
import PasswordInput from "../components/PasswordInput";
import LanguageSwitcher from "../components/LanguageSwitcher";
import logo from "../assets/logo.png";

export default function LoginPage() {
  const { t } = useTranslation();
  const { username, setUsername, password, setPassword, error, needsVerification, submitting, handleSubmit } =
    useLoginForm();

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-lang-row">
          <LanguageSwitcher />
        </div>
        <img src={logo} alt={t("common.appName")} className="auth-logo" />
        <h1 className="auth-title">{t("login.title")}</h1>
        <p className="auth-subtitle">{t("login.subtitle")}</p>

        <form onSubmit={handleSubmit} noValidate>
          <label className="form-label" htmlFor="username">{t("login.username")}</label>
          <input
            id="username"
            type="text"
            className="form-input"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />

          <label className="form-label" htmlFor="password">{t("login.password")}</label>
          <PasswordInput
            id="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />

          {error && (
            <p className="form-error" role="alert">
              {error}
              {needsVerification && (
                <> <Link to="/resend-verification">Resend verification email</Link></>
              )}
            </p>
          )}

          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? t("login.submitting") : t("login.submit")}
          </button>
        </form>

        <p className="auth-switch">
          <Link to="/forgot-password">{t("login.forgotPassword")}</Link>
        </p>
        <p className="auth-switch">
          {t("login.noAccount")} <Link to="/register">{t("login.registerHere")}</Link>
        </p>
      </div>
    </div>
  );
}
