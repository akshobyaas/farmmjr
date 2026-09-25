import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import VerifyEmailPage from "./VerifyEmailPage";
import { useAuth } from "../context/AuthContext";

vi.mock("../context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

function renderAtVerifyLink() {
  render(
    <MemoryRouter initialEntries={["/verify-email/uid123/tok456"]}>
      <Routes>
        <Route path="/verify-email/:uid/:token" element={<VerifyEmailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("VerifyEmailPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls confirmEmailVerification with the uid and token from the URL on mount", async () => {
    const mockConfirm = vi.fn().mockResolvedValue(undefined);
    useAuth.mockReturnValue({ confirmEmailVerification: mockConfirm });

    renderAtVerifyLink();

    await waitFor(() => {
      expect(mockConfirm).toHaveBeenCalledWith("uid123", "tok456");
    });
  });

  it("shows a verifying state before the request resolves", () => {
    useAuth.mockReturnValue({ confirmEmailVerification: vi.fn(() => new Promise(() => {})) });

    renderAtVerifyLink();

    expect(screen.getByText(/verifying your email/i)).toBeInTheDocument();
  });

  it("shows a success message once verification succeeds", async () => {
    const mockConfirm = vi.fn().mockResolvedValue(undefined);
    useAuth.mockReturnValue({ confirmEmailVerification: mockConfirm });

    renderAtVerifyLink();

    await waitFor(() => {
      expect(screen.getByText(/email verified!/i)).toBeInTheDocument();
    });
  });

  it("shows a failure message with a resend link when verification fails", async () => {
    const mockConfirm = vi.fn().mockRejectedValue({ response: { status: 400 } });
    useAuth.mockReturnValue({ confirmEmailVerification: mockConfirm });

    renderAtVerifyLink();

    await waitFor(() => {
      expect(screen.getByText(/verification failed/i)).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: /resend verification email/i })).toBeInTheDocument();
  });
});
