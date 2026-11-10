import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "../context/AuthContext";
import logo from "../assets/logo.png";
import styles from "./WelcomePage.module.css";

/**
 * Task 19 -- the one-time onboarding Welcome screen.
 *
 * Shown by ProtectedRoute (see ProtectedRoute.jsx) instead of whichever
 * protected page a farmer whose Profile.onboarding_status is still
 * "not_started" or "in_progress" asked for.
 *
 * "Get Started" deliberately does NOT build its own add-a-crop form here --
 * it hands off to the existing Crop List -> Crop Detail -> "Track This
 * Crop" flow (CropListPage/CropDetailPage/useCropTracker), reused as-is.
 *
 * Fix round 1 (Task 19 review finding): this marks onboarding_status
 * "in_progress" here, NOT "completed" -- "completed" is only set once a
 * tracker is actually created, from useCropTracker.js's
 * handleTrackerSubmit. Setting "completed" immediately, before any
 * crop/tracker exists, let a farmer who closed the tab, hit back, or
 * navigated elsewhere before adding a crop end up permanently "completed"
 * with zero crops tracked -- contradicting the completed <=> "has an
 * active tracker" invariant Task 16's backfill migration established.
 *
 * Leaving the farmer "in_progress" here works because ProtectedRoute's
 * onboarding gate carries a matching exemption for exactly the Crop
 * List/Crop Detail routes this hand-off uses (/crops and /crops/:id -- see
 * ProtectedRoute.jsx), so they are not bounced back to /welcome while
 * browsing there looking for "Track This Crop". Every other protected
 * route still redirects an in_progress farmer to /welcome. See
 * useCropTracker.js, ProtectedRoute.jsx and task-19-fix1-report.md.
 */
export default function WelcomePage() {
  const { t } = useTranslation();
  const { updateProfile } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleGetStarted = async () => {
    setError("");
    setSubmitting(true);
    try {
      await updateProfile({ onboarding_status: "in_progress" });
      navigate("/crops");
    } catch {
      setError(t("welcome.startError"));
      setSubmitting(false);
    }
  };

  const handleSkip = async () => {
    setError("");
    setSubmitting(true);
    try {
      await updateProfile({ onboarding_status: "skipped" });
      navigate("/dashboard");
    } catch {
      setError(t("welcome.skipError"));
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <img src={logo} alt={t("common.appName")} className="auth-logo" />
        <h1 className="auth-title">{t("welcome.title")}</h1>
        <p className={styles["welcome-body"]}>{t("welcome.body")}</p>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <button
          type="button"
          className="btn-primary"
          onClick={handleGetStarted}
          disabled={submitting}
        >
          {submitting ? t("common.saving") : t("welcome.getStarted")}
        </button>
        <button
          type="button"
          className={styles["welcome-skip"]}
          onClick={handleSkip}
          disabled={submitting}
        >
          {t("welcome.skip")}
        </button>
      </div>
    </div>
  );
}
