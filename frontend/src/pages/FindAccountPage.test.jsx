import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import FindAccountPage from "./FindAccountPage";
import { useAuth } from "../context/AuthContext";

// AuthContext is partially mocked: useAuth() is replaced so tests can
// control the logged-in user, but the real AuthContext object export is
// kept (via importActual) since AppHeader's LanguageSwitcher reads it
// directly with useContext rather than useAuth().
vi.mock("../context/AuthContext", async () => {
  const actual = await vi.importActual("../context/AuthContext");
  return { ...actual, useAuth: vi.fn() };
});

describe("FindAccountPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the backend's message when the account exists", async () => {
    const mockFindAccount = vi.fn().mockResolvedValue({
      detail: "We've sent the username for this email to your inbox.",
    });
    useAuth.mockReturnValue({ findAccount: mockFindAccount });

    render(
      <MemoryRouter>
        <FindAccountPage />
      </MemoryRouter>
    );

    await userEvent.type(screen.getByLabelText(/email/i), "anyone@test.com");
    await userEvent.click(screen.getByRole("button", { name: /send username/i }));

    await waitFor(() => {
      expect(screen.getByText(/we've sent the username/i)).toBeInTheDocument();
    });
    expect(mockFindAccount).toHaveBeenCalledWith("anyone@test.com");
  });

  it("shows the backend's message when no account matches the email", async () => {
    const mockFindAccount = vi.fn().mockResolvedValue({
      detail: "No account is associated with this email address.",
    });
    useAuth.mockReturnValue({ findAccount: mockFindAccount });

    render(
      <MemoryRouter>
        <FindAccountPage />
      </MemoryRouter>
    );

    await userEvent.type(screen.getByLabelText(/email/i), "nobody@test.com");
    await userEvent.click(screen.getByRole("button", { name: /send username/i }));

    await waitFor(() => {
      expect(screen.getByText(/no account is associated/i)).toBeInTheDocument();
    });
  });

  it("shows a rate-limit message on 429 without leaking technical details", async () => {
    const mockFindAccount = vi.fn().mockRejectedValue({ response: { status: 429 } });
    useAuth.mockReturnValue({ findAccount: mockFindAccount });

    render(
      <MemoryRouter>
        <FindAccountPage />
      </MemoryRouter>
    );

    await userEvent.type(screen.getByLabelText(/email/i), "someone@test.com");
    await userEvent.click(screen.getByRole("button", { name: /send username/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/too many requests/i);
    });
  });

  it("links back to the login page", () => {
    useAuth.mockReturnValue({ findAccount: vi.fn() });

    render(
      <MemoryRouter>
        <FindAccountPage />
      </MemoryRouter>
    );

    expect(screen.getByRole("link", { name: /back to login/i })).toHaveAttribute("href", "/login");
  });
});
