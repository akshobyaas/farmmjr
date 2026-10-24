import { Link } from "react-router-dom";
import { useForgotPasswordForm } from "../hooks/useForgotPasswordForm";

export default function ForgotPasswordPage() {
  const { email, setEmail, submitted, error, submitting, handleSubmit } = useForgotPasswordForm();

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">Forgot Password</h1>
        <p className="auth-subtitle">We'll email you a reset link</p>

        {submitted ? (
          <div className="status-card status-ok">
            <p className="status-message">
              If an account with that email exists, a password reset link has been sent.
              Please check your inbox.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <label className="form-label" htmlFor="email">Email</label>
            <input
              id="email" type="email" className="form-input"
              value={email} onChange={(e) => setEmail(e.target.value)}
              autoComplete="email" required
            />
            {error && <p className="form-error" role="alert">{error}</p>}
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? "Sending…" : "Send Reset Link"}
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
