/**
 * Phase 21 — UI Polish Pass.
 *
 * A small set of consistent line icons replacing the emoji previously used
 * for header and bottom-nav "chrome" icons. Emoji render differently across
 * operating systems/fonts (different weight, color, alignment), which broke
 * the single cohesive visual system the redesign is going for. These are
 * plain stroked SVGs with stroke="currentColor", so each one automatically
 * takes on whatever color its container already sets — white in the
 * gradient header, secondary-gray/primary-green in the bottom nav — with no
 * extra CSS needed anywhere it's used.
 *
 * Deliberately scoped to just the icons used as navigational/header chrome
 * (AppHeader call sites + BottomNav items). Inline body-copy glyphs
 * (✅⚠️🌿💧 status marks, the weather-condition emoji map) are left as-is —
 * out of scope for this pass.
 */
const PATHS = {
  home: (
    <path d="M3 11.5 12 4l9 7.5M5.5 10v9a1 1 0 0 0 1 1H10v-6h4v6h3.5a1 1 0 0 0 1-1v-9" />
  ),
  leaf: (
    <path d="M5 19c8 1 13-4 14-14-10 1-15 6-14 14ZM5 19c0-4 2-7 5-9" />
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  cloudSun: (
    <>
      <path d="M7.5 5V3M4 6.5 2.6 5.1M11 6.5l1.4-1.4" />
      <path d="M17.5 19H8a4 4 0 0 1-.6-7.96 5 5 0 0 1 9.7-1.55A4 4 0 0 1 17.5 19Z" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c1.5-4.5 5-6 8-6s6.5 1.5 8 6" />
    </>
  ),
  history: (
    <>
      <path d="M5 6h11a5 5 0 0 1 0 10H8" />
      <path d="m8 12-3 4 3 4M5 4v5h5" />
    </>
  ),
  inbox: (
    <>
      <path d="M4 12h4l2 3h4l2-3h4" />
      <path d="M5.5 5h13l1.5 7v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-6l1.5-7Z" />
    </>
  ),
  chat: (
    <path d="M4 4.5h16v11H9l-4 3.5v-3.5H4Z" />
  ),
  pin: (
    <>
      <path d="M12 21s7-6.6 7-12a7 7 0 0 0-14 0c0 5.4 7 12 7 12Z" />
      <circle cx="12" cy="9" r="2.5" />
    </>
  ),
  play: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M10 8.5v7l6-3.5-6-3.5Z" />
    </>
  ),
};

export default function Icon({ name, size = 22, className = "" }) {
  const path = PATHS[name];
  if (!path) return null;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {path}
    </svg>
  );
}
