/**
 * Weather page design pass (pre-search screen) -- "recent searches" chips,
 * so a farmer who checks the same couple of places doesn't have to retype
 * them every time. Plain localStorage, same `smartfarming_` key naming as
 * api/tokenStorage.js and i18n/languageStorage.js, but this one does parse
 * JSON (an array of strings, not a bare value), so a malformed/corrupted
 * value falls back to an empty list instead of crashing the Weather page
 * on load -- a stricter failure mode than those two modules need, since
 * this is a nice-to-have, not something the app depends on to function.
 */
const RECENT_KEY = "smartfarming_weather_recent_locations";
const MAX_RECENT = 5;

export const recentLocationsStorage = {
  get: () => {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : [];
    } catch {
      return [];
    }
  },
  // Most-recent-first, case-insensitive de-duplicated, capped at
  // MAX_RECENT. Returns the updated list so callers can set state from it
  // directly without a second read.
  add: (city) => {
    const trimmed = (city || "").trim();
    if (!trimmed) return recentLocationsStorage.get();

    const existing = recentLocationsStorage.get();
    const deduped = existing.filter((item) => item.toLowerCase() !== trimmed.toLowerCase());
    const next = [trimmed, ...deduped].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    return next;
  },
};
