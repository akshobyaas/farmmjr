import { useState, useEffect, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function VerifyEmailPage() {
  const { uid, token } = useParams();
  const { confirmEmailVerification } = useAuth();
  const [status, setStatus] = useState("verifying"); // verifying | success | error
  const hasRequestedRef = useRef(false);

  useEffect(() => {
    // Guard against firing the confirm request twice (e.g. React StrictMode's
    // dev-mode double-invoke of effects). The confirmation token is single-use,
    // so a second call would fail with 400 even though the first one already
    // succeeded — without this guard that false failure is what the user sees.
    if (hasRequestedRef.current) return;
    hasRequestedRef.current = true;

    confirmEmailVerification(uid, token)
      .then(() => setStatus("success"))
      .catch(() => setStatus("error"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="auth-title">Email Verification</h1>

        {status === "verifying" && <p className="status-message">Verifying your email…</p>}

        {status === "success" && (
          <div className="status-card status-ok">
            <p className="status-title">✅ Email verified!</p>
            <p className="status-message">You can now log in to your account.</p>
          </div>
        )}

        {status === "error" && (
          <div className="status-card status-error">
            <p className="status-title">⚠️ Verification failed</p>
            <p className="status-message">This link is invalid or has expired.</p>
          </div>
        )}

        <p className="auth-switch">
          <Link to="/login">Back to login</Link>
          {status === "error" && <> · <Link to="/resend-verification">Resend verification email</Link></>}
        </p>
      </div>
    </div>
  );
}
