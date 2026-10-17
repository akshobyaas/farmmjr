import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import ForgotPasswordPage from "./ForgotPasswordPage";
import { useAuth } from "../context/AuthContext";

// AuthContext is partially mocked: useAuth() is replaced so tests can
// control the logged-in user, but the real AuthContext object export is
// kept (via importActual) since AppHeader's LanguageSwitcher reads it
// directly with useContext rather than useAuth().
vi.mock("../context/AuthContext", async () => {
  const actual = await vi.importActual("../context/AuthContext");
  return { ...actual, useAuth: vi.fn() };
});

describe("ForgotPasswordPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the same generic success message regardless of whether the email exists", async () => {
    const mockRequest = vi.fn().mockResolvedValue({ message: "generic message" });
    useAuth.mockReturnValue({ requestPasswordReset: mockRequest });

    render(
      <MemoryRouter>
        <ForgotPasswordPage />
      </MemoryRouter>
    );

    await userEvent.type(screen.getByLabelText(/email/i), "anyone@test.com");
    await userEvent.click(screen.getByRole("button", { name: /send reset link/i }));

    await waitFor(() => {
      expect(screen.getByText(/if an account with that email exists/i)).toBeInTheDocument();
    });
    expect(mockRequest).toHaveBeenCalledWith("anyone@test.com");
  });

  it("shows a rate-limit message on 429 without leaking technical details", async () => {
    const mockRequest = vi.fn().mockRejectedValue({ response: { status: 429 } });
    useAuth.mockReturnValue({ requestPasswordReset: mockRequest });

    render(
      <MemoryRouter>
        <ForgotPasswordPage />
      </MemoryRouter>
    );

    await userEvent.type(screen.getByLabelText(/email/i), "someone@test.com");
    await userEvent.click(screen.getByRole("button", { name: /send reset link/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/too many requests/i);
    });
  });
});
