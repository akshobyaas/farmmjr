/**
 * The app's three supported UI languages, as a single source of truth.
 *
 * Each language's own name is shown in its own script regardless of the
 * current UI language (so a Kannada speaker can recognize "ಕನ್ನಡ" even
 * while the UI is showing English) -- the same convention RegisterPage's
 * and ProfilePage's preferred-language dropdowns already used before this
 * list existed; those now read from here instead of hardcoding their own
 * copies.
 *
 * - `short`: compact label for the always-visible LanguageSwitcher buttons.
 * - `full`: longer label for the <select> dropdowns on Register/Profile.
 */
export const LANGUAGES = [
  { code: "en", short: "EN", full: "English" },
  { code: "kn", short: "ಕನ್ನಡ", full: "ಕನ್ನಡ (Kannada)" },
  { code: "hi", short: "हिं", full: "हिन्दी (Hindi)" },
];

export function languageName(code) {
  return LANGUAGES.find((lang) => lang.code === code)?.full || code || "";
}
