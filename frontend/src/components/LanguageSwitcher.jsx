import { useContext } from "react";
import { useTranslation } from "react-i18next";
import { AuthContext } from "../context/AuthContext";
import { LANGUAGES } from "../i18n/languages";
import { languageStorage } from "../i18n/languageStorage";

/**
 * Always-visible language picker -- three short buttons (not a hidden
 * dropdown menu) so switching is a single tap, consistent with how the rest
 * of this app avoids hidden menus for its non-tech-savvy target audience
 * (see BottomNav.jsx). Lives in AppHeader (so it's on every logged-in page
 * for free) and separately on the Login/Register pages, which don't use
 * AppHeader.
 *
 * Picking a language always switches the UI instantly (i18n.changeLanguage).
 * If someone's logged in, it's also saved to their account's
 * preferred_language (same PATCH ProfilePage's own language field already
 * makes) so it sticks on their next login. If nobody's logged in yet, it's
 * saved to this browser only (languageStorage) so it survives a refresh and
 * is what Login/Register and the rest of the app start in next time --
 * until they log in, at which point their account's saved preference wins,
 * same as always.
 *
 * Reads AuthContext directly with useContext rather than the throwing
 * useAuth() -- see that export's own comment for why.
 */
export default function LanguageSwitcher({ className = "" }) {
  const { t, i18n } = useTranslation();
  const auth = useContext(AuthContext);

  const handlePick = (code) => {
    if (code === i18n.language) return;
    i18n.changeLanguage(code);
    if (auth?.user) {
      // Fire-and-forget: the switch above already happened for this
      // session regardless of whether the save succeeds, and a save
      // failure here isn't worth interrupting anyone over.
      auth.updateProfile({ preferred_language: code }).catch(() => {});
    } else {
      languageStorage.set(code);
    }
  };

  return (
    <div
      className={`language-switcher ${className}`.trim()}
      role="group"
      aria-label={t("common.languageSwitcherLabel")}
    >
      {LANGUAGES.map((lang) => (
        <button
          key={lang.code}
          type="button"
          className={`language-switcher-btn${i18n.language === lang.code ? " active" : ""}`}
          aria-pressed={i18n.language === lang.code}
          onClick={() => handlePick(lang.code)}
        >
          {lang.short}
        </button>
      ))}
    </div>
  );
}
