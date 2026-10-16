import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

// Pulls a readable message out of a DRF error response -- the backend
// returns different shapes depending on which check failed
// (non_field_errors for the "wrong credentials" / "already verified" cases,
// a per-field array for a bad new_email), so this checks the common shapes
// in order rather than assuming one.
function extractServerError(err) {
  const data = err.response?.data;
  if (!data) return null;
  if (Array.isArray(data.non_field_errors) && data.non_field_errors[0]) {
    return data.non_field_errors[0];
  }
  for (const field of ["new_email", "username", "password"]) {
    if (Array.isArray(data[field]) && data[field][0]) {
      return data[field][0];
    }
  }
  return null;
}

export default function ResendVerificationPage() {
  const { resendVerification, changeUnverifiedEmail } = useAuth();

  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // "Wrong email?" flow -- separate from the form above since it needs
  // username + password to prove account ownership instead of the
  // (possibly wrong, possibly unreachable) old email address.
  const [showChangeEmail, setShowChangeEmail] = useState(false);
  const [changeUsername, setChangeUsername] = useState("");
  const [changePassword, setChangePassword] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [changeSubmitted, setChangeSubmitted] = useState(false);
  const [changeError, setChangeError] = useState("");
  const [changeSubmitting, setChangeSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await resendVerification(email);
      setSubmitted(true);
    } catch (err) {
      if (err.response?.status === 429) {
        setError("Too many requests. Please wait a minute and try again.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleChangeEmailSubmit = async (e) => {
    e.preventDefault();
    setChangeError("");
    setChangeSubmitting(true);
    try {
      await changeUnverifiedEmail(changeUsername, changePassword, newEmail);
      setChangeSubmitted(true);
    } catch (err) {
      if (err.response?.status === 429) {
        setChangeError("Too many requests. Please wait a minute and try again.");
      } else {
        setChangeError(extractServerError(err) || "Something went wrong. Please check your details and try again.");
      }
    } finally {
      setChangeSubmitting(false);
    }
  };

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
              className="link-button"
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
            <form onSubmit={handleChangeEmailSubmit} noValidate className="auth-secondary-form">
              <p className="form-hint">
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
              <input
                id="change-password" type="password" className="form-input"
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
                className="link-button"
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
