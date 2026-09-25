import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ProtectedRoute from "./ProtectedRoute";
import { useAuth } from "../context/AuthContext";

vi.mock("../context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

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
    useAuth.mockReturnValue({ user: null, loading: true });
    renderProtected();
    expect(screen.getByText(/checking your session/i)).toBeInTheDocument();
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
