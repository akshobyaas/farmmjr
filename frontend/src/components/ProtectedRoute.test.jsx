import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ProtectedRoute from "./ProtectedRoute";
import { useAuth } from "../context/AuthContext";

// AuthContext is partially mocked: useAuth() is replaced so tests can
// control the logged-in user, but the real AuthContext object export is
// kept (via importActual) since AppHeader's LanguageSwitcher reads it
// directly with useContext rather than useAuth().
vi.mock("../context/AuthContext", async () => {
  const actual = await vi.importActual("../context/AuthContext");
  return { ...actual, useAuth: vi.fn() };
});

function renderProtected(initialEntries = ["/dashboard"]) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/login" element={<div>Login Page</div>} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <div>Secret Dashboard Content</div>
            </ProtectedRoute>
          }
        />
        <Route
          path="/welcome"
          element={
            <ProtectedRoute>
              <div>Welcome Page</div>
            </ProtectedRoute>
          }
        />
        <Route
          path="/crops"
          element={
            <ProtectedRoute>
              <div>Crop List Page</div>
            </ProtectedRoute>
          }
        />
        <Route
          path="/crops/:id"
          element={
            <ProtectedRoute>
              <div>Crop Detail Page</div>
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

describe("ProtectedRoute", () => {
  it("shows a loading state while the session check is in progress", () => {
    // Modern-UI polish pass: the loading state is now PageSkeleton's
    // shimmer shape, not visible "Checking your session…" text -- the
    // equivalent accessible-tech announcement moved to the status role's
    // aria-label instead (see PageSkeleton.test.jsx for that component's
    // own coverage).
    useAuth.mockReturnValue({ user: null, loading: true });
    renderProtected();
    expect(screen.getByRole("status")).toHaveAccessibleName(/checking your session/i);
    expect(screen.queryByText(/secret dashboard content/i)).not.toBeInTheDocument();
  });

  it("redirects to /login when there is no authenticated user", () => {
    useAuth.mockReturnValue({ user: null, loading: false });
    renderProtected();
    expect(screen.getByText(/login page/i)).toBeInTheDocument();
    expect(screen.queryByText(/secret dashboard content/i)).not.toBeInTheDocument();
  });

  it("renders the protected content when a user IS authenticated", () => {
    useAuth.mockReturnValue({ user: { username: "testfarmer1" }, loading: false });
    renderProtected();
    expect(screen.getByText(/secret dashboard content/i)).toBeInTheDocument();
  });

  // Task 19 -- one-time onboarding gate (Profile.onboarding_status).
  // Checked here, not only "at login", because this same component
  // re-runs its check on every protected-route mount, including a plain
  // page reload (AuthContext's fetchMe re-fetches the user and this
  // component re-evaluates against the fresh value) -- see
  // task-19-report.md for why that -- rather than a one-shot
  // post-login-only check -- is the correct place for this.
  describe("onboarding gate", () => {
    it.each(["not_started", "in_progress"])(
      "redirects to /welcome when onboarding_status is %s",
      (onboarding_status) => {
        useAuth.mockReturnValue({
          user: { username: "testfarmer1", onboarding_status },
          loading: false,
        });
        renderProtected();
        expect(screen.getByText(/welcome page/i)).toBeInTheDocument();
        expect(screen.queryByText(/secret dashboard content/i)).not.toBeInTheDocument();
      }
    );

    it.each(["completed", "skipped"])(
      "goes straight to the protected content when onboarding_status is %s",
      (onboarding_status) => {
        useAuth.mockReturnValue({
          user: { username: "testfarmer1", onboarding_status },
          loading: false,
        });
        renderProtected();
        expect(screen.getByText(/secret dashboard content/i)).toBeInTheDocument();
        expect(screen.queryByText(/welcome page/i)).not.toBeInTheDocument();
      }
    );

    it("does not redirect-loop when already on /welcome with onboarding not finished", () => {
      useAuth.mockReturnValue({
        user: { username: "testfarmer1", onboarding_status: "not_started" },
        loading: false,
      });
      renderProtected(["/welcome"]);
      expect(screen.getByText(/welcome page/i)).toBeInTheDocument();
    });

    // Fix round 1 (Task 19 review finding): WelcomePage's "Get Started" now
    // leaves onboarding_status "in_progress" until a tracker is actually
    // created (see useCropTracker.js and WelcomePage.jsx), so this gate
    // must not bounce an in_progress farmer back to /welcome while they are
    // still inside the Crop List / Crop Detail add-flow those two routes
    // cover -- otherwise they could never reach "Track This Crop".
    describe("crop-flow exemption while onboarding is in_progress", () => {
      it("does not redirect to /welcome when visiting /crops", () => {
        useAuth.mockReturnValue({
          user: { username: "testfarmer1", onboarding_status: "in_progress" },
          loading: false,
        });
        renderProtected(["/crops"]);
        expect(screen.getByText(/crop list page/i)).toBeInTheDocument();
        expect(screen.queryByText(/welcome page/i)).not.toBeInTheDocument();
      });

      it("does not redirect to /welcome when visiting /crops/:id", () => {
        useAuth.mockReturnValue({
          user: { username: "testfarmer1", onboarding_status: "in_progress" },
          loading: false,
        });
        renderProtected(["/crops/42"]);
        expect(screen.getByText(/crop detail page/i)).toBeInTheDocument();
        expect(screen.queryByText(/welcome page/i)).not.toBeInTheDocument();
      });

      it("still redirects a not_started farmer away from /crops (exemption is in_progress-only)", () => {
        useAuth.mockReturnValue({
          user: { username: "testfarmer1", onboarding_status: "not_started" },
          loading: false,
        });
        renderProtected(["/crops"]);
        expect(screen.getByText(/welcome page/i)).toBeInTheDocument();
        expect(screen.queryByText(/crop list page/i)).not.toBeInTheDocument();
      });

      it("still redirects an in_progress farmer away from unrelated protected routes like /dashboard", () => {
        useAuth.mockReturnValue({
          user: { username: "testfarmer1", onboarding_status: "in_progress" },
          loading: false,
        });
        renderProtected(["/dashboard"]);
        expect(screen.getByText(/welcome page/i)).toBeInTheDocument();
        expect(screen.queryByText(/secret dashboard content/i)).not.toBeInTheDocument();
      });
    });

    // Final-review fix (F3) -- the onboarding gate never checked
    // `user.role`. Admin/expert accounts never have a crop tracker, so
    // they never finish onboarding either, and used to get bounced to the
    // farmer-facing /welcome screen on every protected route until they
    // manually clicked Skip. Onboarding is a farmer-only concept (see
    // DashboardPage.jsx's own `user?.role === "admin"` check for the same
    // role string), so an admin account must be exempt from this gate
    // entirely, regardless of onboarding_status.
    describe("admin accounts are exempt from the onboarding gate", () => {
      it("does not redirect an admin user with onboarding_status not_started", () => {
        useAuth.mockReturnValue({
          user: { username: "admin_lakshmi", role: "admin", onboarding_status: "not_started" },
          loading: false,
        });
        renderProtected(["/dashboard"]);
        expect(screen.getByText(/secret dashboard content/i)).toBeInTheDocument();
        expect(screen.queryByText(/welcome page/i)).not.toBeInTheDocument();
      });

      it("does not redirect an admin user with onboarding_status in_progress", () => {
        useAuth.mockReturnValue({
          user: { username: "admin_lakshmi", role: "admin", onboarding_status: "in_progress" },
          loading: false,
        });
        renderProtected(["/dashboard"]);
        expect(screen.getByText(/secret dashboard content/i)).toBeInTheDocument();
        expect(screen.queryByText(/welcome page/i)).not.toBeInTheDocument();
      });

      it("still redirects a non-admin (farmer) user, confirming the exemption is role-specific", () => {
        useAuth.mockReturnValue({
          user: { username: "testfarmer1", onboarding_status: "not_started" },
          loading: false,
        });
        renderProtected(["/dashboard"]);
        expect(screen.getByText(/welcome page/i)).toBeInTheDocument();
      });
    });
  });
});
