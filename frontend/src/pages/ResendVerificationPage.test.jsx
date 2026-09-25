import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import ResendVerificationPage from "./ResendVerificationPage";
import { useAuth } from "../context/AuthContext";

vi.mock("../context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

describe("ResendVerificationPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the same generic confirmation regardless of whether the email exists or is already verified", async () => {
    const mockResend = vi.fn().mockResolvedValue(undefined);
    useAuth.mockReturnValue({ resendVerification: mockResend });

    render(
      <MemoryRouter>
        <ResendVerificationPage />
      </MemoryRouter>
    );

    await userEvent.type(screen.getByLabelText(/email/i), "someone@test.com");
    await userEvent.click(screen.getByRole("button", { name: /resend link/i }));

    await waitFor(() => {
      expect(screen.getByText(/if an account with that email exists/i)).toBeInTheDocument();
    });
    expect(mockResend).toHaveBeenCalledWith("someone@test.com");
  });

  it("shows a rate-limit message on 429 without leaking technical details", async () => {
    const mockResend = vi.fn().mockRejectedValue({ response: { status: 429 } });
    useAuth.mockReturnValue({ resendVerification: mockResend });

    render(
      <MemoryRouter>
        <ResendVerificationPage />
      </MemoryRouter>
    );

    await userEvent.type(screen.getByLabelText(/email/i), "someone@test.com");
    await userEvent.click(screen.getByRole("button", { name: /resend link/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/too many requests/i);
    });
  });

  it("shows a generic error message for any other failure", async () => {
    const mockResend = vi.fn().mockRejectedValue({ response: { status: 500 } });
    useAuth.mockReturnValue({ resendVerification: mockResend });

    render(
      <MemoryRouter>
        <ResendVerificationPage />
      </MemoryRouter>
    );

    await userEvent.type(screen.getByLabelText(/email/i), "someone@test.com");
    await userEvent.click(screen.getByRole("button", { name: /resend link/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/something went wrong/i);
    });
  });
});
