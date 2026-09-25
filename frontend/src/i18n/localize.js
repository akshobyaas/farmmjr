// Picks a backend-translated crop-guidance field (e.g. Crop.name_kn /
// Crop.name_hi) for the given language, falling back to the base English
// field when the translation is missing or blank -- the same fallback
// discipline as the UI chrome strings in locales/*.json (Phase 18 plan:
// "missing translation for a string -> falls back to English, not a
// blank/broken label").
export function localizeField(obj, baseField, lang) {
  if (!obj) return "";
  if (lang && lang !== "en") {
    const translated = obj[`${baseField}_${lang}`];
    if (translated) return translated;
  }
  return obj[baseField] ?? "";
}
