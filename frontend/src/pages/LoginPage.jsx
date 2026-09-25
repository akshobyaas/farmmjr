import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [needsVerification, setNeedsVerification] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setNeedsVerification(false);
    setSubmitting(true);
    try {
      await login(username, password);
      navigate("/dashboard");
    } catch (err) {
      const status = err.response?.status;
      const code = err.response?.data?.code?.[0] || err.response?.data?.code;
      if (status === 429) {
        setError("Too many attempts. Please wait a minute and try again.");
      } else if (code === "email_not_verified") {
        setError("Please verify your email address before logging in.");
        setNeedsVerification(true);
      } else {
        setError("Incorrect username or password. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
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
          <input
            id="password"
            type="password"
            className="form-input"
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
