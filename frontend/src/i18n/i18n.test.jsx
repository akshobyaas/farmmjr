import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import i18n from "./index";
import { localizeField } from "./localize";
import DashboardPage from "../pages/DashboardPage";
import LoginPage from "../pages/LoginPage";
import { useAuth } from "../context/AuthContext";

vi.mock("../context/AuthContext", () => ({
  useAuth: vi.fn(),
}));

// i18n is a module-level singleton (initialized once in src/test/setup.js),
// so every test in this file must leave it back on "en" afterward --
// otherwise a leftover language change here could make an unrelated test
// file's assertions (written for the default English UI) fail depending
// on run order.
afterEach(async () => {
  await act(async () => {
    await i18n.changeLanguage("en");
  });
});

describe("Phase 18 — language switching (UI chrome)", () => {
  it("renders the dashboard's persistent nav in English by default", () => {
    useAuth.mockReturnValue({ user: { username: "farmer_ravi", role: "farmer", preferred_language: "en" }, logout: vi.fn() });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );

    expect(screen.getByText("Crop Guidance")).toBeInTheDocument();
    expect(screen.getByText("Log Out")).toBeInTheDocument();
  });

  it("switches the dashboard's nav labels live when the language changes to Kannada", async () => {
    useAuth.mockReturnValue({ user: { username: "farmer_ravi", role: "farmer", preferred_language: "en" }, logout: vi.fn() });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );

    await act(async () => {
      await i18n.changeLanguage("kn");
    });

    expect(screen.getByText("ಬೆಳೆ ಮಾರ್ಗದರ್ಶನ")).toBeInTheDocument();
    expect(screen.getByText("ಲಾಗ್ ಔಟ್")).toBeInTheDocument();
  });

  it("switches to Hindi labels too", async () => {
    useAuth.mockReturnValue({ user: { username: "farmer_ravi", role: "farmer", preferred_language: "en" }, logout: vi.fn() });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );

    await act(async () => {
      await i18n.changeLanguage("hi");
    });

    expect(screen.getByText("फसल मार्गदर्शन")).toBeInTheDocument();
    expect(screen.getByText("लॉग आउट")).toBeInTheDocument();
  });

  it("shows the admin-specific nav label for an admin user", () => {
    useAuth.mockReturnValue({ user: { username: "admin_expert", role: "admin", preferred_language: "en" }, logout: vi.fn() });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );

    expect(screen.getByText("Advisory Queries")).toBeInTheDocument();
    expect(screen.queryByText("Ask an Expert")).not.toBeInTheDocument();
  });

  it("falls back to English rather than a blank/broken label when switched to a language with no translations configured", async () => {
    useAuth.mockReturnValue({ user: { username: "farmer_ravi", role: "farmer", preferred_language: "en" }, logout: vi.fn() });

    render(
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    );

    // "fr" was never registered as a resource bundle -- i18next's
    // fallbackLng: "en" (configured in index.js) should kick in rather
    // than rendering the raw key or an empty string.
    await act(async () => {
      await i18n.changeLanguage("fr");
    });

    expect(screen.getByText("Crop Guidance")).toBeInTheDocument();
    expect(screen.queryByText("dashboard.links.crops")).not.toBeInTheDocument();
  });
});

describe("Phase 18 — regression: core auth flow still works in a non-English language setting", () => {
  it("logs in successfully while the active language is Kannada, with Kannada labels shown", async () => {
    const mockLogin = vi.fn().mockResolvedValue(undefined);
    useAuth.mockReturnValue({ login: mockLogin });

    await act(async () => {
      await i18n.changeLanguage("kn");
    });

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>
    );

    expect(screen.getByText("ಮತ್ತೆ ಸ್ವಾಗತ")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("ಬಳಕೆದಾರಹೆಸರು"), "farmer_ravi");
    await userEvent.type(screen.getByLabelText("ಪಾಸ್‌ವರ್ಡ್"), "FarmerPass#123");
    await userEvent.click(screen.getByRole("button", { name: "ಲಾಗ್ ಇನ್" }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenCalledWith("farmer_ravi", "FarmerPass#123");
    });
  });
});

describe("Phase 18 — localizeField (crop-guidance content translation)", () => {
  const crop = {
    name: "Arecanut",
    name_kn: "ಅಡಿಕೆ",
    name_hi: "सुपारी",
    soil_type: "Laterite soil",
    soil_type_kn: "", // deliberately untranslated
  };

  it("returns the base English field when the language is English", () => {
    expect(localizeField(crop, "name", "en")).toBe("Arecanut");
  });

  it("returns the translated field when present for the active language", () => {
    expect(localizeField(crop, "name", "kn")).toBe("ಅಡಿಕೆ");
    expect(localizeField(crop, "name", "hi")).toBe("सुपारी");
  });

  it("falls back to the English field when the translation is blank, not a blank label", () => {
    expect(localizeField(crop, "soil_type", "kn")).toBe("Laterite soil");
  });

  it("handles a missing object gracefully", () => {
    expect(localizeField(null, "name", "kn")).toBe("");
  });
});
