import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import kn from "./locales/kn.json";
import hi from "./locales/hi.json";
import { languageStorage } from "./languageStorage";

// Phase 18 -- UI chrome translation. fallbackLng: "en" is what satisfies
// the phase plan's testing requirement ("missing translation for a string
// -> falls back to English, not a blank/broken label"): any key present
// in en.json but missing from kn.json/hi.json renders in English instead
// of showing the raw key or a blank string.
//
// lng: a logged-out visitor's language choice (LanguageSwitcher, saved via
// languageStorage) is read here synchronously, so even the very first
// paint -- the Login page, before anyone is authenticated -- already shows
// their chosen language instead of flashing English first. A logged-in
// user's saved preferred_language still wins once AuthContext loads them
// (see its own language-sync effect), the same as before this existed.
i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    kn: { translation: kn },
    hi: { translation: hi },
  },
  lng: languageStorage.get() || "en",
  fallbackLng: "en",
  interpolation: {
    escapeValue: false, // React already escapes -- avoid double-escaping.
  },
});

export default i18n;
