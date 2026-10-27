import { useContext } from "react";
import { useTranslation } from "react-i18next";
import { AuthContext } from "../context/AuthContext";
import { LANGUAGES, languageName } from "../i18n/languages";
import { languageStorage } from "../i18n/languageStorage";

/**
 * Always-visible language picker -- a single button (not a hidden dropdown
 * menu) so switching is a single tap, consistent with how the rest of this
 * app avoids hidden menus for its non-tech-savvy target audience (see
 * BottomNav.jsx). Lives in AppHeader (so it's on every logged-in page for
 * free) and separately on the Login/Register pages, which don't use
 * AppHeader.
 *
 * The button always shows the currently active language's short label
 * (EN / ಕನ್ನಡ / हिं). Tapping it cycles to the next language in LANGUAGES
 * order and wraps back to the first -- en -> kn -> hi -> en -> ... --
 * rather than offering three separate buttons, since a single repeatable
 * tap is simpler for this audience than picking a specific target out of a
 * row of options.
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

  const currentIndex = LANGUAGES.findIndex((lang) => lang.code === i18n.language);
  const current = LANGUAGES[currentIndex === -1 ? 0 : currentIndex];
  const next = LANGUAGES[(currentIndex === -1 ? 0 : currentIndex + 1) % LANGUAGES.length];

  const handleCycle = () => {
    const code = next.code;
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
    <button
      type="button"
      className={`language-switcher ${className}`.trim()}
      aria-label={t("common.languageSwitcherLabel", { language: languageName(current.code) })}
      onClick={handleCycle}
    >
      {current.short}
    </button>
  );
}
