import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ResetPasswordPage() {
  const { uid, token } = useParams();
  const { confirmPasswordReset } = useAuth();
  const navigate = useNavigate();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (newPassword !== confirmPw) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      await confirmPasswordReset(uid, token, newPassword, confirmPw);
      setSuccess(true);
      setTimeout(() => navigate("/login"), 2000);
    } catch (err) {
      const data = err.response?.data;
      if (data?.new_password) {
        setError(Array.isArray(data.new_password) ? data.new_password[0] : data.new_password);
      } else if (data?.non_field_errors) {
        setError(Array.isArray(data.non_field_errors) ? data.non_field_errors[0] : data.non_field_errors);
      } else {
        setError("This reset link is invalid or has expired. Please request a new one.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="status-card status-ok">
            <p className="status-title">✅ Password reset!</p>
            <p className="status-message">Redirecting you to login…</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">Reset Your Password</h1>
        <p className="auth-subtitle">Choose a new password below</p>

        <form onSubmit={handleSubmit} noValidate>
          <label className="form-label" htmlFor="new_password">New Password</label>
          <input
            id="new_password" type="password" className="form-input"
            value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password" required
          />

          <label className="form-label" htmlFor="confirm">Confirm New Password</label>
          <input
            id="confirm" type="password" className="form-input"
            value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)}
            autoComplete="new-password" required
          />

          {error && <p className="form-error" role="alert">{error}</p>}

          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? "Resetting…" : "Reset Password"}
          </button>
        </form>

        <p className="auth-switch">
          <Link to="/forgot-password">Request a new link</Link>
        </p>
      </div>
    </div>
  );
}
