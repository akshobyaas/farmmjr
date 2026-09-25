import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ResetPasswordPage from "./ResetPasswordPage";
import { useAuth } from "../context/AuthContext";

vi.mock("../context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderAtResetLink() {
  render(
    <MemoryRouter initialEntries={["/reset-password/uid123/tok456"]}>
      <Routes>
        <Route path="/reset-password/:uid/:token" element={<ResetPasswordPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("ResetPasswordPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("passes the uid and token from the URL through to the confirm call, not just the password", async () => {
    const mockConfirm = vi.fn().mockResolvedValue(undefined);
    useAuth.mockReturnValue({ confirmPasswordReset: mockConfirm });

    renderAtResetLink();

    await userEvent.type(screen.getByLabelText(/^new password$/i), "NewSecurePass#1");
    await userEvent.type(screen.getByLabelText(/confirm new password/i), "NewSecurePass#1");
    await userEvent.click(screen.getByRole("button", { name: /reset password/i }));

    await waitFor(() => {
      expect(mockConfirm).toHaveBeenCalledWith("uid123", "tok456", "NewSecurePass#1", "NewSecurePass#1");
    });
  });

  it("blocks submission client-side when the two password fields don't match", async () => {
    const mockConfirm = vi.fn();
    useAuth.mockReturnValue({ confirmPasswordReset: mockConfirm });

    renderAtResetLink();

    await userEvent.type(screen.getByLabelText(/^new password$/i), "NewSecurePass#1");
    await userEvent.type(screen.getByLabelText(/confirm new password/i), "somethingelse");
    await userEvent.click(screen.getByRole("button", { name: /reset password/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/do not match/i);
    });
    expect(mockConfirm).not.toHaveBeenCalled();
  });

  it("shows an invalid-or-expired message for a bad reset link, without redirecting", async () => {
    const mockConfirm = vi.fn().mockRejectedValue({ response: { status: 400, data: {} } });
    useAuth.mockReturnValue({ confirmPasswordReset: mockConfirm });

    renderAtResetLink();

    await userEvent.type(screen.getByLabelText(/^new password$/i), "NewSecurePass#1");
    await userEvent.type(screen.getByLabelText(/confirm new password/i), "NewSecurePass#1");
    await userEvent.click(screen.getByRole("button", { name: /reset password/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/invalid or has expired/i);
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("shows a success message and redirects to login shortly after", async () => {
    const mockConfirm = vi.fn().mockResolvedValue(undefined);
    useAuth.mockReturnValue({ confirmPasswordReset: mockConfirm });

    renderAtResetLink();

    await userEvent.type(screen.getByLabelText(/^new password$/i), "NewSecurePass#1");
    await userEvent.type(screen.getByLabelText(/confirm new password/i), "NewSecurePass#1");
    await userEvent.click(screen.getByRole("button", { name: /reset password/i }));

    await waitFor(() => {
      expect(screen.getByText(/password reset!/i)).toBeInTheDocument();
    });

    await vi.advanceTimersByTimeAsync(2000);
    expect(mockNavigate).toHaveBeenCalledWith("/login");
  });
});
