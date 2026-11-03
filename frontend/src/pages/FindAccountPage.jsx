import { Link } from "react-router-dom";
import { useFindAccountForm } from "../hooks/useFindAccountForm";

// Mirrors ForgotPasswordPage.jsx's shape -- same flow, different field it
// recovers (username instead of a password reset link).
export default function FindAccountPage() {
  const { email, setEmail, submitted, error, submitting, handleSubmit } = useFindAccountForm();

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">Find My Account</h1>
        <p className="auth-subtitle">We'll email you your username</p>

        {submitted ? (
          <div className="status-card status-ok">
            <p className="status-message">
              If an account with that email exists, the username has been sent to it.
              Please check your inbox.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <div className="field-box">
              <label className="field-box-label" htmlFor="email">Email</label>
              <input
                id="email" type="email" className="field-box-input"
                value={email} onChange={(e) => setEmail(e.target.value)}
                autoComplete="email" required
              />
            </div>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? "Sending…" : "Send Username"}
            </button>
          </form>
        )}

        <p className="auth-switch">
          <Link to="/login">Back to login</Link>
        </p>
      </div>
    </div>
  );
}
