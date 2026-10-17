import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import i18n from "../i18n";
import { AuthContext } from "../context/AuthContext";
import LanguageSwitcher from "./LanguageSwitcher";

// i18n is a module-level singleton (initialized once in src/test/setup.js),
// so -- same as i18n.test.jsx -- every test here that changes it must leave
// it back on "en" afterward, and localStorage (languageStorage's backing
// store) is cleared too so one test's pick can't leak into the next.
afterEach(() => {
  i18n.changeLanguage("en");
  localStorage.clear();
});

describe("LanguageSwitcher", () => {
  it("renders a short, always-visible button for each supported language", () => {
    render(<LanguageSwitcher />);
    expect(screen.getByRole("button", { name: "EN" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ಕನ್ನಡ" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "हिं" })).toBeInTheDocument();
  });

  it("marks the currently active language's button, and only that one", async () => {
    render(<LanguageSwitcher />);
    expect(screen.getByRole("button", { name: "EN" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "ಕನ್ನಡ" })).toHaveAttribute("aria-pressed", "false");

    await userEvent.click(screen.getByRole("button", { name: "ಕನ್ನಡ" }));

    expect(screen.getByRole("button", { name: "ಕನ್ನಡ" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "EN" })).toHaveAttribute("aria-pressed", "false");
  });

  it("switches the UI language immediately when a button is tapped", async () => {
    render(<LanguageSwitcher />);
    await userEvent.click(screen.getByRole("button", { name: "हिं" }));
    expect(i18n.language).toBe("hi");
  });

  it("when nobody is logged in (no AuthContext value), saves the pick to browser storage", async () => {
    render(<LanguageSwitcher />);
    await userEvent.click(screen.getByRole("button", { name: "ಕನ್ನಡ" }));
    expect(localStorage.getItem("smartfarming_lang")).toBe("kn");
  });

  it("when nobody is logged in but a real AuthProvider has no user yet, still saves to browser storage", async () => {
    render(
      <AuthContext.Provider value={{ user: null, updateProfile: vi.fn() }}>
        <LanguageSwitcher />
      </AuthContext.Provider>
    );
    await userEvent.click(screen.getByRole("button", { name: "हिं" }));
    expect(localStorage.getItem("smartfarming_lang")).toBe("hi");
  });

  it("when someone is logged in, saves the pick to their account instead of browser storage", async () => {
    const updateProfile = vi.fn().mockResolvedValue({});
    render(
      <AuthContext.Provider value={{ user: { id: 1, username: "farmer_ravi" }, updateProfile }}>
        <LanguageSwitcher />
      </AuthContext.Provider>
    );
    await userEvent.click(screen.getByRole("button", { name: "ಕನ್ನಡ" }));

    expect(updateProfile).toHaveBeenCalledWith({ preferred_language: "kn" });
    expect(localStorage.getItem("smartfarming_lang")).toBeNull();
  });

  it("does nothing when the already-active language's button is tapped again", async () => {
    const updateProfile = vi.fn();
    render(
      <AuthContext.Provider value={{ user: { id: 1 }, updateProfile }}>
        <LanguageSwitcher />
      </AuthContext.Provider>
    );
    await userEvent.click(screen.getByRole("button", { name: "EN" }));
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it("keeps working, saving to browser storage, when rendered with no AuthProvider at all", async () => {
    // This is the real-world case for 9 existing pages' tests that render
    // AppHeader (and so this component) without any AuthContext mock --
    // see AuthContext.jsx's own comment on why this must not throw.
    render(<LanguageSwitcher />);
    await userEvent.click(screen.getByRole("button", { name: "हिं" }));
    expect(i18n.language).toBe("hi");
    expect(localStorage.getItem("smartfarming_lang")).toBe("hi");
  });
});
