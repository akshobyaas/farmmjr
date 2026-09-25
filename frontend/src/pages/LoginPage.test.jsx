import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import LoginPage from "./LoginPage";
import { useAuth } from "../context/AuthContext";

vi.mock("../context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

describe("LoginPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders username and password fields", () => {
    useAuth.mockReturnValue({ login: vi.fn() });
    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
  });

  it("submits credentials and navigates to dashboard on success", async () => {
    const mockLogin = vi.fn().mockResolvedValue(undefined);
    useAuth.mockReturnValue({ login: mockLogin });

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

    await userEvent.type(screen.getByLabelText(/username/i), "testfarmer1");
    await userEvent.type(screen.getByLabelText(/^password$/i), "SecurePass#2026");
    await userEvent.click(screen.getByRole("button", { name: /log in/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith("testfarmer1", "SecurePass#2026");
      expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
    });
  });

  it("shows a plain-language error on failed login, without exposing raw error details", async () => {
    const mockLogin = vi.fn().mockRejectedValue({ response: { status: 401 } });
    useAuth.mockReturnValue({ login: mockLogin });

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

    await userEvent.type(screen.getByLabelText(/username/i), "wronguser");
    await userEvent.type(screen.getByLabelText(/^password$/i), "wrongpass");
    await userEvent.click(screen.getByRole("button", { name: /log in/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/incorrect username or password/i);
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("shows a rate-limit-specific message on 429 responses", async () => {
    const mockLogin = vi.fn().mockRejectedValue({ response: { status: 429 } });
    useAuth.mockReturnValue({ login: mockLogin });

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

    await userEvent.type(screen.getByLabelText(/username/i), "testfarmer1");
    await userEvent.type(screen.getByLabelText(/^password$/i), "whatever");
    await userEvent.click(screen.getByRole("button", { name: /log in/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/too many attempts/i);
    });
  });

  it("shows a resend-verification link when login fails due to unverified email", async () => {
    const mockLogin = vi.fn().mockRejectedValue({
      response: { status: 400, data: { code: ["email_not_verified"] } },
    });
    useAuth.mockReturnValue({ login: mockLogin });

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

    await userEvent.type(screen.getByLabelText(/username/i), "unverifieduser");
    await userEvent.type(screen.getByLabelText(/^password$/i), "SecurePass#2026");
    await userEvent.click(screen.getByRole("button", { name: /log in/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/verify your email/i);
    });
    expect(screen.getByRole("link", { name: /resend verification email/i })).toBeInTheDocument();
  });
});
