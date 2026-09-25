import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import RegisterPage from "./RegisterPage";
import { useAuth } from "../context/AuthContext";

vi.mock("../context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

async function fillValidForm() {
  await userEvent.type(screen.getByLabelText(/username/i), "newfarmer1");
  await userEvent.type(screen.getByLabelText(/^email$/i), "newfarmer1@test.com");
  await userEvent.type(screen.getByLabelText(/^password$/i), "SecurePass#2026");
  await userEvent.type(screen.getByLabelText(/confirm password/i), "SecurePass#2026");
}

describe("RegisterPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers with role always set to farmer, regardless of what's in the form state", async () => {
    const mockRegister = vi.fn().mockResolvedValue(undefined);
    useAuth.mockReturnValue({ register: mockRegister });

    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>
    );

    await fillValidForm();
    await userEvent.click(screen.getByRole("button", { name: /register/i }));

    await waitFor(() => {
      expect(mockRegister).toHaveBeenCalledWith(
        expect.objectContaining({
          username: "newfarmer1",
          email: "newfarmer1@test.com",
          role: "farmer",
        })
      );
      expect(mockNavigate).toHaveBeenCalledWith("/login");
    });
  });

  it("blocks submission client-side when password and confirmation don't match", async () => {
    const mockRegister = vi.fn();
    useAuth.mockReturnValue({ register: mockRegister });

    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>
    );

    await userEvent.type(screen.getByLabelText(/username/i), "newfarmer1");
    await userEvent.type(screen.getByLabelText(/^email$/i), "newfarmer1@test.com");
    await userEvent.type(screen.getByLabelText(/^password$/i), "SecurePass#2026");
    await userEvent.type(screen.getByLabelText(/confirm password/i), "somethingelse");
    await userEvent.click(screen.getByRole("button", { name: /register/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/do not match/i);
    });
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it("surfaces the backend's first field-level error message on a failed registration", async () => {
    const mockRegister = vi.fn().mockRejectedValue({
      response: { data: { username: ["A user with that username already exists."] } },
    });
    useAuth.mockReturnValue({ register: mockRegister });

    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>
    );

    await fillValidForm();
    await userEvent.click(screen.getByRole("button", { name: /register/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/already exists/i);
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });

  it("shows live password hints that update as the user types", async () => {
    useAuth.mockReturnValue({ register: vi.fn() });

    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>
    );

    // No hints before anything is typed.
    expect(screen.queryByText(/at least 8 characters/i)).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/^password$/i), "1234567");
    expect(screen.getByText(/at least 8 characters/i).closest("li")).toHaveClass("hint-pending");

    await userEvent.type(screen.getByLabelText(/^password$/i), "8");
    expect(screen.getByText(/at least 8 characters/i).closest("li")).toHaveClass("hint-ok");
    // All-numeric password should still show the "not entirely numeric" hint as pending.
    expect(screen.getByText(/not entirely numeric/i).closest("li")).toHaveClass("hint-pending");
  });
});
