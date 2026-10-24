import { useParams, Link } from "react-router-dom";
import { useResetPasswordForm } from "../hooks/useResetPasswordForm";
import PasswordInput from "../components/PasswordInput";

export default function ResetPasswordPage() {
  const { uid, token } = useParams();
  const { newPassword, setNewPassword, confirmPw, setConfirmPw, error, success, submitting, handleSubmit } =
    useResetPasswordForm(uid, token);

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
          <PasswordInput
            id="new_password"
            value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password" required
          />

          <label className="form-label" htmlFor="confirm">Confirm New Password</label>
          <PasswordInput
            id="confirm"
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
