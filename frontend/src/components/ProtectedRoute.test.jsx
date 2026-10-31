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

function renderProtected() {
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
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
});
