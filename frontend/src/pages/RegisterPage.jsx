import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";

function getPasswordHints(password) {
  return {
    minLength: password.length >= 8,
    notAllNumeric: password.length > 0 && !/^\d+$/.test(password),
  };
}

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
    password_confirm: "",
    preferred_language: "en",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const hints = getPasswordHints(form.password);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (form.password !== form.password_confirm) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      await register({ ...form, role: "farmer" });
      navigate("/login");
    } catch (err) {
      const data = err.response?.data;
      if (data && typeof data === "object") {
        const firstField = Object.keys(data)[0];
        const message = Array.isArray(data[firstField]) ? data[firstField][0] : data[firstField];
        setError(message || "Something went wrong. Please try again.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">{t("register.title")}</h1>
        <p className="auth-subtitle">{t("register.subtitle")}</p>

        <form onSubmit={handleSubmit} noValidate>
          <label className="form-label" htmlFor="username">{t("register.username")}</label>
          <input
            id="username" name="username" type="text" className="form-input"
            value={form.username} onChange={handleChange} autoComplete="username" required
          />

          <label className="form-label" htmlFor="email">{t("register.email")}</label>
          <input
            id="email" name="email" type="email" className="form-input"
            value={form.email} onChange={handleChange} autoComplete="email" required
          />

          <label className="form-label" htmlFor="password">{t("register.password")}</label>
          <input
            id="password" name="password" type="password" className="form-input"
            value={form.password} onChange={handleChange} autoComplete="new-password" required
          />
          {form.password.length > 0 && (
            <ul className="password-hints">
              <li className={hints.minLength ? "hint-ok" : "hint-pending"}>
                {hints.minLength ? "✓" : "○"} {t("register.passwordHintLength")}
              </li>
              <li className={hints.notAllNumeric ? "hint-ok" : "hint-pending"}>
                {hints.notAllNumeric ? "✓" : "○"} {t("register.passwordHintNotNumeric")}
              </li>
            </ul>
          )}

          <label className="form-label" htmlFor="password_confirm">{t("register.confirmPassword")}</label>
          <input
            id="password_confirm" name="password_confirm" type="password" className="form-input"
            value={form.password_confirm} onChange={handleChange} autoComplete="new-password" required
          />

          <label className="form-label" htmlFor="preferred_language">{t("register.preferredLanguage")}</label>
          <select
            id="preferred_language" name="preferred_language" className="form-input"
            value={form.preferred_language} onChange={handleChange}
          >
            <option value="en">English</option>
            <option value="kn">ಕನ್ನಡ (Kannada)</option>
            <option value="hi">हिन्दी (Hindi)</option>
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
