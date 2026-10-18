import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import DashboardPage from "./DashboardPage";
import { useAuth } from "../context/AuthContext";
import { fetchRiskAlerts, fetchTodaysTasks } from "../api/cropTracker";

// AuthContext is partially mocked: useAuth() is replaced so tests can
// control the logged-in user, but the real AuthContext object export is
// kept (via importActual) since AppHeader's LanguageSwitcher reads it
// directly with useContext rather than useAuth().
vi.mock("../context/AuthContext", async () => {
  const actual = await vi.importActual("../context/AuthContext");
  return { ...actual, useAuth: vi.fn() };
});

// Task 13 -- auto-mocked the same way ScanHistoryPage.test.jsx mocks
// api/scans: every export of api/cropTracker becomes a vi.fn().
vi.mock("../api/cropTracker");

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return { ...actual, useNavigate: () => mockNavigate };
});

const farmerUser = {
  username: "farmer_ravi",
  role: "farmer",
  preferred_language: "en",
};

const adminUser = {
  username: "admin_lakshmi",
  role: "admin",
  preferred_language: "en",
};

describe("DashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no active tracker / no alert, so the four pre-existing
    // tests below (which don't care about risk alerts) see the normal
    // fallback path rather than an unresolved promise.
    vi.mocked(fetchRiskAlerts).mockResolvedValue({ trackers: [] });
    // Task 18 default: no tasks for today, so the ten pre-existing tests
    // above (which don't care about today's tasks) don't see an
    // unresolved promise or an unexpected card.
    vi.mocked(fetchTodaysTasks).mockResolvedValue({ tasks: [] });
  });

  it("greets the logged-in user by username", () => {
    useAuth.mockReturnValue({ user: farmerUser, logout: vi.fn() });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );

    expect(screen.getByText(/good (morning|afternoon|evening), farmer_ravi/i)).toBeInTheDocument();
  });

  it("shows the farmer-facing 'Ask an Expert' link for a farmer, not the admin queries link", () => {
    useAuth.mockReturnValue({ user: farmerUser, logout: vi.fn() });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );

    expect(screen.getByRole("link", { name: /ask an expert/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /advisory queries/i })).not.toBeInTheDocument();
  });

  it("shows the admin-facing 'Advisory Queries' link for an admin, not the farmer ask-an-expert link", () => {
    useAuth.mockReturnValue({ user: adminUser, logout: vi.fn() });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );

    expect(screen.getByRole("link", { name: /advisory queries/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^ask an expert$/i })).not.toBeInTheDocument();
  });

  it("logs out and navigates to /login when Log Out is clicked", async () => {
    const mockLogout = vi.fn().mockResolvedValue(undefined);
    useAuth.mockReturnValue({ user: farmerUser, logout: mockLogout });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );

    await userEvent.click(screen.getByRole("button", { name: /log out/i }));

    expect(mockLogout).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith("/login");
  });

  // Task 13 -- the weather highlight card's description switches from the
  // static teaser to a real proactive risk alert when one exists.
  it("shows a real risk alert on the weather highlight card when one exists", async () => {
    useAuth.mockReturnValue({ user: farmerUser, logout: vi.fn() });
    vi.mocked(fetchRiskAlerts).mockResolvedValue({
      trackers: [{ disease_name: "Mahali / Koleroga (Bud Rot)", risk_level: "high" }],
    });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );

    expect(await screen.findByText(/Koleroga/i)).toBeInTheDocument();
  });

  // Fix round 1 (review finding 1) -- the brief's given test above only
  // covers the flat shape (disease_name/risk_level directly on a tracker
  // entry). Nothing exercised the real Task 12 endpoint shape, where each
  // tracker nests its own alerts under "risk_alerts". Cover that branch
  // directly so a regression there isn't invisible to this suite.
  it("shows a risk alert from the real nested risk_alerts shape the production endpoint actually returns", async () => {
    useAuth.mockReturnValue({ user: farmerUser, logout: vi.fn() });
    vi.mocked(fetchRiskAlerts).mockResolvedValue({
      trackers: [
        {
          tracker_id: 1,
          crop_id: 1,
          crop_name: "Arecanut",
          current_stage: "Flowering",
          risk_alerts: [
            {
              disease_name: "Mahali / Koleroga (Bud Rot)",
              risk_level: "high",
              advisory_text: "Inspect for bud rot.",
              source_citation: "ICAR-CPCRI Kasaragod advisory.",
            },
          ],
        },
      ],
    });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );

    expect(await screen.findByText(/Koleroga/i)).toBeInTheDocument();
  });

  // Fix round 1 (review finding 2) -- a farmer can have more than one
  // active tracker (no uniqueness constraint across different crops), each
  // with its own alerts. The dashboard must show the single most urgent
  // alert across ALL active trackers, not just whichever tracker happens
  // to come first in the response.
  it("shows the highest-risk alert across multiple active trackers, not just the first tracker's", async () => {
    useAuth.mockReturnValue({ user: farmerUser, logout: vi.fn() });
    vi.mocked(fetchRiskAlerts).mockResolvedValue({
      trackers: [
        {
          tracker_id: 1,
          crop_id: 1,
          crop_name: "Rice",
          current_stage: "Vegetative",
          risk_alerts: [{ disease_name: "Leaf Spot", risk_level: "low" }],
        },
        {
          tracker_id: 2,
          crop_id: 2,
          crop_name: "Arecanut",
          current_stage: "Flowering",
          risk_alerts: [{ disease_name: "Bud Rot Alpha", risk_level: "high" }],
        },
      ],
    });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );

    expect(await screen.findByText(/Bud Rot Alpha/i)).toBeInTheDocument();
    expect(screen.queryByText(/Leaf Spot/i)).not.toBeInTheDocument();
  });

  it("falls back to the static teaser when there is no risk alert", async () => {
    useAuth.mockReturnValue({ user: farmerUser, logout: vi.fn() });
    vi.mocked(fetchRiskAlerts).mockResolvedValue({ trackers: [] });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );

    expect(await screen.findByText(/today.?s weather/i)).toBeInTheDocument(); // existing static copy
  });

  // Task 13's own addition, beyond the brief's two given tests: the
  // real endpoint (Task 12) returns a plain-language {"detail": ...}
  // (no "trackers" key at all) when the farmer has active trackers but
  // hasn't set home_location yet. This must not crash and must not nag
  // on every dashboard load -- just fall back to the static teaser,
  // same as the no-alert case.
  it("falls back to the static teaser when the response is the no-home-location detail shape", async () => {
    useAuth.mockReturnValue({ user: farmerUser, logout: vi.fn() });
    vi.mocked(fetchRiskAlerts).mockResolvedValue({
      detail: "Set your location on your profile to see risk alerts.",
    });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );

    expect(await screen.findByText(/today.?s weather/i)).toBeInTheDocument();
    expect(screen.getByText(/see current conditions for your area/i)).toBeInTheDocument();
  });

  it("falls back to the static teaser without crashing if fetchRiskAlerts rejects", async () => {
    useAuth.mockReturnValue({ user: farmerUser, logout: vi.fn() });
    vi.mocked(fetchRiskAlerts).mockRejectedValue(new Error("network error"));

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );

    expect(await screen.findByText(/see current conditions for your area/i)).toBeInTheDocument();
  });

  // Task 18
  it("shows today's tasks when the farmer has an active tracker", async () => {
    useAuth.mockReturnValue({ user: farmerUser, logout: vi.fn() });
    vi.mocked(fetchTodaysTasks).mockResolvedValue({
      tasks: [{ id: 1, category: "irrigation", instruction: "Irrigate every 3 days." }],
    });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );

    expect(await screen.findByText(/irrigate every 3 days/i)).toBeInTheDocument();
  });

  it("renders no tasks card when there are no tasks", async () => {
    useAuth.mockReturnValue({ user: farmerUser, logout: vi.fn() });
    vi.mocked(fetchTodaysTasks).mockResolvedValue({ tasks: [] });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );

    expect(screen.queryByTestId("dashboard-tasks-card")).not.toBeInTheDocument();
  });

  it("shows multiple tasks across different categories, each with a translated category label", async () => {
    useAuth.mockReturnValue({ user: farmerUser, logout: vi.fn() });
    vi.mocked(fetchTodaysTasks).mockResolvedValue({
      tasks: [
        { id: 1, category: "irrigation", instruction: "Irrigate every 3 days." },
        { id: 2, category: "fertilizer", instruction: "Apply balanced NPK feed." },
      ],
    });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );

    expect(await screen.findByText(/irrigate every 3 days/i)).toBeInTheDocument();
    expect(screen.getByText(/apply balanced npk feed/i)).toBeInTheDocument();
    expect(screen.getByText("Irrigation")).toBeInTheDocument();
    expect(screen.getByText("Fertilizer")).toBeInTheDocument();
  });

  it("falls back without crashing if fetchTodaysTasks rejects", async () => {
    useAuth.mockReturnValue({ user: farmerUser, logout: vi.fn() });
    vi.mocked(fetchTodaysTasks).mockRejectedValue(new Error("network error"));

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );

    expect(await screen.findByText(/good (morning|afternoon|evening), farmer_ravi/i)).toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-tasks-card")).not.toBeInTheDocument();
  });
});
