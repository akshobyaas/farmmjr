import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import DashboardPage from "./DashboardPage";
import { useAuth } from "../context/AuthContext";

// AuthContext is partially mocked: useAuth() is replaced so tests can
// control the logged-in user, but the real AuthContext object export is
// kept (via importActual) since AppHeader's LanguageSwitcher reads it
// directly with useContext rather than useAuth().
vi.mock("../context/AuthContext", async () => {
  const actual = await vi.importActual("../context/AuthContext");
  return { ...actual, useAuth: vi.fn() };
});

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

const farmerUser = {
  username: "farmer_ravi",
  role: "farmer",
  preferred_language: "en",
};

const adminUser = {
  username: "admin_lakshmi",
  role: "admin",
  preferred_language: "en",
};

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("greets the logged-in user by username", () => {
    useAuth.mockReturnValue({ user: farmerUser, logout: vi.fn() });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );

    expect(screen.getByText(/good (morning|afternoon|evening), farmer_ravi/i)).toBeInTheDocument();
  });

  it("shows the farmer-facing 'Ask an Expert' link for a farmer, not the admin queries link", () => {
    useAuth.mockReturnValue({ user: farmerUser, logout: vi.fn() });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );

    expect(screen.getByRole("link", { name: /ask an expert/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /advisory queries/i })).not.toBeInTheDocument();
  });

  it("shows the admin-facing 'Advisory Queries' link for an admin, not the farmer ask-an-expert link", () => {
    useAuth.mockReturnValue({ user: adminUser, logout: vi.fn() });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );

    expect(screen.getByRole("link", { name: /advisory queries/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^ask an expert$/i })).not.toBeInTheDocument();
  });

  it("logs out and navigates to /login when Log Out is clicked", async () => {
    const mockLogout = vi.fn().mockResolvedValue(undefined);
    useAuth.mockReturnValue({ user: farmerUser, logout: mockLogout });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );

    await userEvent.click(screen.getByRole("button", { name: /log out/i }));

    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith("/login");
  });
});
