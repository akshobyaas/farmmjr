import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import PageSkeleton from "./PageSkeleton";

// Task 19 -- the one-time onboarding flow. A farmer whose Profile.
// onboarding_status is still "not_started" or "in_progress" is sent to
// /welcome instead of whatever protected page they asked for.
//
// This check runs here, on EVERY protected-route mount -- not just once
// right after login -- because that is what actually matches how the app
// restores a session: a page reload re-runs AuthContext's fetchMe (see
// AuthContext.jsx), which re-fetches onboarding_status fresh from the
// server, and this component re-renders against that fresh value exactly
// the same way it does right after a fresh login. Gating only "at login"
// would need a *second*, separate check for the reload/session-restore
// case to behave the same way -- this one check covers both for free.
//
// This does not trap a farmer who has started onboarding, but has not yet
// finished it: WelcomePage's "Get Started" sets onboarding_status to
// "in_progress" (not straight to "completed") before it navigates them
// into the existing Crop List -> Crop Detail -> "Track This Crop" flow,
// which is what actually flips it to "completed" once a tracker is
// created (see useCropTracker.js). For that hand-off to work, an
// in_progress farmer has to be able to browse the Crop List/Detail routes
// below without this gate bouncing them straight back to /welcome --
// CROP_FLOW_PATH_PATTERN is that exemption. It is deliberately narrow (just
// /crops and /crops/:id, matching App.jsx's routes for that flow) so every
// OTHER protected route (dashboard, weather, profile, tasks, etc.) still
// correctly bounces an in_progress/not_started farmer back to /welcome.
// See WelcomePage.jsx, useCropTracker.js and task-19-report.md /
// task-19-fix1-report.md for why.
const ONBOARDING_INCOMPLETE_STATUSES = ["not_started", "in_progress"];
const CROP_FLOW_PATH_PATTERN = /^\/crops(\/[^/]+)?$/;

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return <PageSkeleton label="Checking your session…" />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Final-review fix (F3) -- onboarding ("track your first crop") is a
  // farmer-only concept. Admin/expert accounts never have a crop tracker
  // of their own, so they could never reach onboarding_status
  // "completed" either, and used to be bounced to /welcome on every
  // protected route until they manually clicked Skip. Exempting
  // `role === "admin"` entirely (same role string DashboardPage.jsx
  // already keys its own admin-vs-farmer rendering on) means this gate
  // is skipped before the onboarding_status check ever runs for them.
  const isAdmin = user.role === "admin";

  const isOnboardingGateExempt =
    isAdmin ||
    location.pathname === "/welcome" ||
    (user.onboarding_status === "in_progress" &&
      CROP_FLOW_PATH_PATTERN.test(location.pathname));

  if (
    ONBOARDING_INCOMPLETE_STATUSES.includes(user.onboarding_status) &&
    !isOnboardingGateExempt
  ) {
    return <Navigate to="/welcome" replace />;
  }

  return children;
}
