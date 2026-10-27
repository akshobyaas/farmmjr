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
  it("renders a single button showing the currently active language", () => {
    render(<LanguageSwitcher />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveTextContent("EN");
  });

  it("cycles English -> Kannada -> Hindi -> English on repeated taps", async () => {
    render(<LanguageSwitcher />);
    const button = screen.getByRole("button");
    expect(button).toHaveTextContent("EN");

    await userEvent.click(button);
    expect(button).toHaveTextContent("ಕನ್ನಡ");
    expect(i18n.language).toBe("kn");

    await userEvent.click(button);
    expect(button).toHaveTextContent("हिं");
    expect(i18n.language).toBe("hi");

    await userEvent.click(button);
    expect(button).toHaveTextContent("EN");
    expect(i18n.language).toBe("en");
  });

  it("describes the current language in its accessible label", () => {
    render(<LanguageSwitcher />);
    expect(screen.getByRole("button").getAttribute("aria-label")).toMatch(/english/i);
  });

  it("when nobody is logged in (no AuthContext value), saves each pick to browser storage", async () => {
    render(<LanguageSwitcher />);
    await userEvent.click(screen.getByRole("button"));
    expect(localStorage.getItem("smartfarming_lang")).toBe("kn");
  });

  it("when nobody is logged in but a real AuthProvider has no user yet, still saves to browser storage", async () => {
    render(
      <AuthContext.Provider value={{ user: null, updateProfile: vi.fn() }}>
        <LanguageSwitcher />
      </AuthContext.Provider>
    );
    await userEvent.click(screen.getByRole("button"));
    expect(localStorage.getItem("smartfarming_lang")).toBe("kn");
  });

  it("when someone is logged in, saves the pick to their account instead of browser storage", async () => {
    const updateProfile = vi.fn().mockResolvedValue({});
    render(
      <AuthContext.Provider value={{ user: { id: 1, username: "farmer_ravi" }, updateProfile }}>
        <LanguageSwitcher />
      </AuthContext.Provider>
    );
    await userEvent.click(screen.getByRole("button"));

    expect(updateProfile).toHaveBeenCalledWith({ preferred_language: "kn" });
    expect(localStorage.getItem("smartfarming_lang")).toBeNull();
  });

  it("keeps working, saving to browser storage, when rendered with no AuthProvider at all", async () => {
    // This is the real-world case for 9 existing pages' tests that render
    // AppHeader (and so this component) without any AuthContext mock --
    // see AuthContext.jsx's own comment on why this must not throw.
    render(<LanguageSwitcher />);
    await userEvent.click(screen.getByRole("button"));
    expect(i18n.language).toBe("kn");
    expect(localStorage.getItem("smartfarming_lang")).toBe("kn");
  });
});
