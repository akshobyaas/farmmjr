import { Link } from "react-router-dom";
import { useResendVerification } from "../hooks/useResendVerification";
import PasswordInput from "../components/PasswordInput";
import styles from "./ResendVerificationPage.module.css";

export default function ResendVerificationPage() {
  const {
    email,
    setEmail,
    submitted,
    error,
    submitting,
    showChangeEmail,
    setShowChangeEmail,
    changeUsername,
    setChangeUsername,
    changePassword,
    setChangePassword,
    newEmail,
    setNewEmail,
    changeSubmitted,
    changeError,
    changeSubmitting,
    handleSubmit,
    handleChangeEmailSubmit,
  } = useResendVerification();

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">Resend Verification Email</h1>

        {submitted ? (
          <div className="status-card status-ok">
            <p className="status-message">
              If an account with that email exists and isn't verified yet, a new link has been sent.
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
              {submitting ? "Sending…" : "Resend Link"}
            </button>
          </form>
        )}

        {!showChangeEmail && !changeSubmitted && (
          <p className="auth-switch">
            <button
              type="button"
              className={styles["link-button"]}
              onClick={() => setShowChangeEmail(true)}
            >
              Wrong email? Change it
            </button>
          </p>
        )}

        {showChangeEmail && (
          changeSubmitted ? (
            <div className="status-card status-ok">
              <p className="status-message">
                Email updated. A new verification link has been sent to the new address.
              </p>
            </div>
          ) : (
            <form onSubmit={handleChangeEmailSubmit} noValidate className={styles["auth-secondary-form"]}>
              <p className={styles["form-hint"]}>
                Typo'd your email at signup? Confirm your account with your username and
                password, and we'll send the verification link to the corrected address instead.
              </p>

              <label className="form-label" htmlFor="change-username">Username</label>
              <input
                id="change-username" type="text" className="form-input"
                value={changeUsername} onChange={(e) => setChangeUsername(e.target.value)}
                autoComplete="username" required
              />

              <label className="form-label" htmlFor="change-password">Password</label>
              <PasswordInput
                id="change-password"
                value={changePassword} onChange={(e) => setChangePassword(e.target.value)}
                autoComplete="current-password" required
              />

              <label className="form-label" htmlFor="change-new-email">New email</label>
              <input
                id="change-new-email" type="email" className="form-input"
                value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
                autoComplete="email" required
              />

              {changeError && <p className="form-error" role="alert">{changeError}</p>}

              <button type="submit" className="btn-primary" disabled={changeSubmitting}>
                {changeSubmitting ? "Updating…" : "Update Email & Resend Link"}
              </button>
              <button
                type="button"
                className={styles["link-button"]}
                onClick={() => setShowChangeEmail(false)}
              >
                Cancel
              </button>
            </form>
          )
        )}

        <p className="auth-switch">
          <Link to="/login">Back to login</Link>
        </p>
      </div>
    </div>
  );
}
