import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import ProfilePage from "./ProfilePage";
import { useAuth } from "../context/AuthContext";

vi.mock("../context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

const mockProfile = {
  id: 1,
  username: "farmer_ravi",
  email: "ravi@test.com",
  first_name: "",
  last_name: "",
  phone_number: "",
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
    useAuth.mockReturnValue({ getProfile: mockGet, updateProfile: vi.fn() });

    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>
    );

    await waitFor(() => {
      expect(screen.getByText("farmer_ravi")).toBeInTheDocument();
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
        preferred_language: "en",
      });
    });
    const sentPayload = mockUpdate.mock.calls[0][0];
    expect(sentPayload).not.toHaveProperty("username");
    expect(sentPayload).not.toHaveProperty("email");
    expect(sentPayload).not.toHaveProperty("role");
    expect(sentPayload).not.toHaveProperty("is_verified");
  });

  it("shows a success message after a successful save", async () => {
    const mockGet = vi.fn().mockResolvedValue(mockProfile);
    const mockUpdate = vi.fn().mockResolvedValue(mockProfile);
    useAuth.mockReturnValue({ getProfile: mockGet, updateProfile: mockUpdate });

    render(
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>
    );

    await waitFor(() => screen.getByRole("button", { name: /save changes/i }));
    await userEvent.click(screen.getByRole("button", { name: /save changes/i }));

    await waitFor(() => {
      expect(screen.getByText(/profile updated successfully/i)).toBeInTheDocument();
    });
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
