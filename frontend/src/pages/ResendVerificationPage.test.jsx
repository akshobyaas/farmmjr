import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import ResendVerificationPage from "./ResendVerificationPage";
import { useAuth } from "../context/AuthContext";

// AuthContext is partially mocked: useAuth() is replaced so tests can
// control the logged-in user, but the real AuthContext object export is
// kept (via importActual) since AppHeader's LanguageSwitcher reads it
// directly with useContext rather than useAuth().
vi.mock("../context/AuthContext", async () => {
  const actual = await vi.importActual("../context/AuthContext");
  return { ...actual, useAuth: vi.fn() };
});

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

describe("ResendVerificationPage - change email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hides the change-email form until the toggle link is clicked, then shows it", async () => {
    useAuth.mockReturnValue({
      resendVerification: vi.fn(),
      changeUnverifiedEmail: vi.fn(),
    });

    render(
      <MemoryRouter>
        <ResendVerificationPage />
      </MemoryRouter>
    );

    expect(screen.queryByLabelText(/username/i)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /wrong email\? change it/i }));

    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^password$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/new email/i)).toBeInTheDocument();
  });

  it("submits username, password and the new email, then shows a confirmation", async () => {
    const mockChange = vi.fn().mockResolvedValue(undefined);
    useAuth.mockReturnValue({
      resendVerification: vi.fn(),
      changeUnverifiedEmail: mockChange,
    });

    render(
      <MemoryRouter>
        <ResendVerificationPage />
      </MemoryRouter>
    );

    await userEvent.click(screen.getByRole("button", { name: /wrong email\? change it/i }));
    await userEvent.type(screen.getByLabelText(/username/i), "raitha1");
    await userEvent.type(screen.getByLabelText(/^password$/i), "whatever-pass");
    await userEvent.type(screen.getByLabelText(/new email/i), "correct@test.com");
    await userEvent.click(screen.getByRole("button", { name: /update email/i }));

    await waitFor(() => {
      expect(screen.getByText(/email updated/i)).toBeInTheDocument();
    });
    expect(mockChange).toHaveBeenCalledWith("raitha1", "whatever-pass", "correct@test.com");
  });

  it("shows a rate-limit message on 429 without leaking technical details", async () => {
    const mockChange = vi.fn().mockRejectedValue({ response: { status: 429 } });
    useAuth.mockReturnValue({
      resendVerification: vi.fn(),
      changeUnverifiedEmail: mockChange,
    });

    render(
      <MemoryRouter>
        <ResendVerificationPage />
      </MemoryRouter>
    );

    await userEvent.click(screen.getByRole("button", { name: /wrong email\? change it/i }));
    await userEvent.type(screen.getByLabelText(/username/i), "raitha1");
    await userEvent.type(screen.getByLabelText(/^password$/i), "whatever-pass");
    await userEvent.type(screen.getByLabelText(/new email/i), "correct@test.com");
    await userEvent.click(screen.getByRole("button", { name: /update email/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/too many requests/i);
    });
  });

  it("surfaces the server's validation message (e.g. wrong password) instead of a generic one", async () => {
    const mockChange = vi.fn().mockRejectedValue({
      response: { status: 400, data: { non_field_errors: ["Invalid username or password."] } },
    });
    useAuth.mockReturnValue({
      resendVerification: vi.fn(),
      changeUnverifiedEmail: mockChange,
    });

    render(
      <MemoryRouter>
        <ResendVerificationPage />
      </MemoryRouter>
    );

    await userEvent.click(screen.getByRole("button", { name: /wrong email\? change it/i }));
    await userEvent.type(screen.getByLabelText(/username/i), "raitha1");
    await userEvent.type(screen.getByLabelText(/^password$/i), "wrong-pass");
    await userEvent.type(screen.getByLabelText(/new email/i), "correct@test.com");
    await userEvent.click(screen.getByRole("button", { name: /update email/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/invalid username or password/i);
    });
  });

  it("falls back to a generic message when the server gives no readable detail", async () => {
    const mockChange = vi.fn().mockRejectedValue({ response: { status: 500 } });
    useAuth.mockReturnValue({
      resendVerification: vi.fn(),
      changeUnverifiedEmail: mockChange,
    });

    render(
      <MemoryRouter>
        <ResendVerificationPage />
      </MemoryRouter>
    );

    await userEvent.click(screen.getByRole("button", { name: /wrong email\? change it/i }));
    await userEvent.type(screen.getByLabelText(/username/i), "raitha1");
    await userEvent.type(screen.getByLabelText(/^password$/i), "whatever-pass");
    await userEvent.type(screen.getByLabelText(/new email/i), "correct@test.com");
    await userEvent.click(screen.getByRole("button", { name: /update email/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/something went wrong/i);
    });
  });

  it("hides the change-email form again when Cancel is clicked", async () => {
    useAuth.mockReturnValue({
      resendVerification: vi.fn(),
      changeUnverifiedEmail: vi.fn(),
    });

    render(
      <MemoryRouter>
        <ResendVerificationPage />
      </MemoryRouter>
    );

    await userEvent.click(screen.getByRole("button", { name: /wrong email\? change it/i }));
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.queryByLabelText(/username/i)).not.toBeInTheDocument();
  });
});
