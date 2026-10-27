import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import ProfilePage from "./ProfilePage";
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

const mockProfile = {
  id: 1,
  username: "farmer_ravi",
  email: "ravi@test.com",
  first_name: "",
  last_name: "",
  phone_number: "",
  home_location: "",
  preferred_language: "en",
  role: "farmer",
  is_verified: true,
};

describe("ProfilePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads and displays the user's own profile", async () => {
    const mockGet = vi.fn().mockResolvedValue(mockProfile);
    useAuth.mockReturnValue({ getProfile: mockGet, updateProfile: vi.fn(), logout: vi.fn() });

    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByLabelText(/username/i)).toHaveValue("farmer_ravi");
    });
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it("submits only the editable fields on save — never username, email, role, or is_verified", async () => {
    const mockGet = vi.fn().mockResolvedValue(mockProfile);
    const mockUpdate = vi.fn().mockResolvedValue({ ...mockProfile, first_name: "Ravi" });
    useAuth.mockReturnValue({ getProfile: mockGet, updateProfile: mockUpdate });

    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>
    );

    await waitFor(() => screen.getByLabelText(/first name/i));
    await userEvent.type(screen.getByLabelText(/first name/i), "Ravi");
    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith({
        first_name: "Ravi",
        last_name: "",
        phone_number: "",
        home_location: "",
      });
    });
    const sentPayload = mockUpdate.mock.calls[0][0];
    expect(sentPayload).not.toHaveProperty("username");
    expect(sentPayload).not.toHaveProperty("email");
    expect(sentPayload).not.toHaveProperty("role");
    expect(sentPayload).not.toHaveProperty("is_verified");
  });

  it("lets a farmer save their home location", async () => {
    const mockGet = vi.fn().mockResolvedValue(mockProfile);
    const mockUpdate = vi.fn().mockResolvedValue(mockProfile);
    useAuth.mockReturnValue({ getProfile: mockGet, updateProfile: mockUpdate });

    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>
    );

    await waitFor(() => screen.getByLabelText(/location/i));
    await userEvent.type(screen.getByLabelText(/location/i), "Puttur");
    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ home_location: "Puttur" })
      );
    });
  });

  it("shows a success message after a successful save", async () => {
    const mockGet = vi.fn().mockResolvedValue(mockProfile);
    const mockUpdate = vi.fn().mockResolvedValue(mockProfile);
    useAuth.mockReturnValue({ getProfile: mockGet, updateProfile: mockUpdate, logout: vi.fn() });

    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>
    );

    // Save Changes only appears once there's an actual change to save (see
    // the "only shows Save Changes once something has changed" test below),
    // so make one first.
    await waitFor(() => screen.getByLabelText(/first name/i));
    await userEvent.type(screen.getByLabelText(/first name/i), "Ravi");
    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(screen.getByText(/profile updated successfully/i)).toBeInTheDocument();
    });
  });

  it("shows the username as a disabled field, not just as plain text, alongside the other profile fields", async () => {
    const mockGet = vi.fn().mockResolvedValue(mockProfile);
    useAuth.mockReturnValue({ getProfile: mockGet, updateProfile: vi.fn(), logout: vi.fn() });

    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>
    );

    const usernameField = await screen.findByLabelText(/username/i);
    expect(usernameField).toHaveValue("farmer_ravi");
    expect(usernameField).toBeDisabled();
  });

  it("no longer shows a Preferred Language field on the profile form -- the header's LanguageSwitcher is the only way to change it now", async () => {
    const mockGet = vi.fn().mockResolvedValue(mockProfile);
    useAuth.mockReturnValue({ getProfile: mockGet, updateProfile: vi.fn(), logout: vi.fn() });

    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>
    );

    await waitFor(() => screen.getByLabelText(/first name/i));
    expect(screen.queryByLabelText(/preferred language/i)).not.toBeInTheDocument();
  });

  it("only shows Save Changes once something has actually changed", async () => {
    const mockGet = vi.fn().mockResolvedValue(mockProfile);
    useAuth.mockReturnValue({ getProfile: mockGet, updateProfile: vi.fn(), logout: vi.fn() });

    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>
    );

    await waitFor(() => screen.getByLabelText(/first name/i));
    expect(screen.queryByRole("button", { name: /save changes/i })).not.toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/first name/i), "R");
    expect(screen.getByRole("button", { name: /save changes/i })).toBeInTheDocument();
  });

  it("always shows a Log Out button, regardless of whether anything has changed", async () => {
    const mockGet = vi.fn().mockResolvedValue(mockProfile);
    const mockLogout = vi.fn().mockResolvedValue(undefined);
    useAuth.mockReturnValue({ getProfile: mockGet, updateProfile: vi.fn(), logout: mockLogout });

    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>
    );

    await waitFor(() => screen.getByLabelText(/first name/i));
    expect(screen.getByRole("button", { name: /log out/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /log out/i }));
    await waitFor(() => expect(mockLogout).toHaveBeenCalledTimes(1));
    expect(mockNavigate).toHaveBeenCalledWith("/login");
  });

  it("shows a plain-language error if loading the profile fails (e.g. a 403 from the backend)", async () => {
    const mockGet = vi.fn().mockRejectedValue({ response: { status: 403 } });
    useAuth.mockReturnValue({ getProfile: mockGet, updateProfile: vi.fn() });

    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/could not load your profile/i);
    });
  });
});
