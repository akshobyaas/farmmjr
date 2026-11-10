import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import WelcomePage from "./WelcomePage";
import { useAuth } from "../context/AuthContext";

// Same partial-mock pattern as ProfilePage.test.jsx/CropListPage tests:
// useAuth() is replaced so the test controls updateProfile, but the real
// AuthContext module is kept for anything else that reads it directly.
vi.mock("../context/AuthContext", async () => {
  const actual = await vi.importActual("../context/AuthContext");
  return { ...actual, useAuth: vi.fn() };
});

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

function renderWelcome() {
  return render(
    <MemoryRouter>
      <WelcomePage />
    </MemoryRouter>
  );
}

describe("WelcomePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a welcome heading and both actions", () => {
    useAuth.mockReturnValue({
      user: { username: "testfarmer1", first_name: "" },
      updateProfile: vi.fn(),
    });
    renderWelcome();

    expect(screen.getByRole("button", { name: /get started/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /skip for now/i })).toBeInTheDocument();
  });

  // Step 4 -- "Get Started" path: reuses the existing Crop List "add to
  // tracker" flow instead of duplicating it here, so it hands off to
  // /crops rather than building its own add-a-crop form.
  //
  // Fix round 1 (Task 19 review finding): this marks onboarding
  // "in_progress", not "completed", before the hand-off -- "completed"
  // only happens once a tracker is actually created, from
  // useCropTracker.js's handleTrackerSubmit. Marking "completed" here,
  // before any crop/tracker exists, let a farmer who closed the tab or
  // navigated away mid-flow get stuck permanently "completed" with zero
  // crops tracked. ProtectedRoute's crop-flow exemption (see
  // ProtectedRoute.test.jsx) is what keeps an in_progress farmer from
  // being bounced back to /welcome while they browse /crops and
  // /crops/:id to get there.
  it("marks onboarding in_progress and routes to the Crop List on Get Started", async () => {
    const mockUpdateProfile = vi.fn().mockResolvedValue({ onboarding_status: "in_progress" });
    useAuth.mockReturnValue({
      user: { username: "testfarmer1", first_name: "" },
      updateProfile: mockUpdateProfile,
    });
    renderWelcome();

    await userEvent.click(screen.getByRole("button", { name: /get started/i }));

    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith({ onboarding_status: "in_progress" });
    });
    expect(mockNavigate).toHaveBeenCalledWith("/crops");
  });

  // Step 4 -- "Skip for now" path.
  it("marks onboarding skipped and routes straight to the Dashboard on Skip", async () => {
    const mockUpdateProfile = vi.fn().mockResolvedValue({ onboarding_status: "skipped" });
    useAuth.mockReturnValue({
      user: { username: "testfarmer1", first_name: "" },
      updateProfile: mockUpdateProfile,
    });
    renderWelcome();

    await userEvent.click(screen.getByRole("button", { name: /skip for now/i }));

    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith({ onboarding_status: "skipped" });
    });
    expect(mockNavigate).toHaveBeenCalledWith("/dashboard");
  });

  it("shows a plain-language error and re-enables the buttons if Get Started fails", async () => {
    const mockUpdateProfile = vi.fn().mockRejectedValue(new Error("network error"));
    useAuth.mockReturnValue({
      user: { username: "testfarmer1", first_name: "" },
      updateProfile: mockUpdateProfile,
    });
    renderWelcome();

    await userEvent.click(screen.getByRole("button", { name: /get started/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /get started/i })).not.toBeDisabled();
  });

  it("shows a plain-language error if Skip fails", async () => {
    const mockUpdateProfile = vi.fn().mockRejectedValue(new Error("network error"));
    useAuth.mockReturnValue({
      user: { username: "testfarmer1", first_name: "" },
      updateProfile: mockUpdateProfile,
    });
    renderWelcome();

    await userEvent.click(screen.getByRole("button", { name: /skip for now/i }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
    expect(mockNavigate).not.toHaveBeenCalled();
  });
});
