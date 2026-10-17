/**
 * Where a logged-out visitor's language choice lives, before they have an
 * account for it to be saved to as `preferred_language` -- see
 * components/LanguageSwitcher.jsx. Read synchronously by this module's
 * sibling i18n/index.js (so the very first paint, including the Login
 * page, already uses it) and by AuthContext's language-sync effect (so it
 * doesn't stomp this choice back to English while nobody's logged in yet).
 *
 * Plain localStorage, same as api/tokenStorage.js -- no try/catch, for the
 * same reason: this app doesn't support running with storage disabled.
 */
const LANG_KEY = "smartfarming_lang";

export const languageStorage = {
  get: () => localStorage.getItem(LANG_KEY),
  set: (code) => localStorage.setItem(LANG_KEY, code),
};
