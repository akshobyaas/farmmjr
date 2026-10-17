# Google Material Symbols — source icons

The 12 SVG files in this folder are the real, unmodified artwork from Google's
**Material Symbols** icon set (the "Google icons" referenced in `Icon.jsx`),
downloaded verbatim via the official npm package rather than hand-drawn or
reconstructed from memory:

- Package: `@material-symbols/svg-400@0.48.0`
- Style: Outlined, default weight (400) / grade (0) / fill (0)
- Upstream source: https://github.com/google/material-design-icons
- License: Apache License 2.0 (same as the upstream repo's `LICENSE`)

`Icon.jsx` does not import these files directly — it embeds each one's
`<path d="...">` data (copied byte-for-byte from these files, not retyped) into
its own `PATHS` object, keeping the project's existing single-component,
zero-new-dependency icon architecture (one `<svg>` wrapper, `fill="currentColor"`
so every icon inherits its container's color automatically). These files are
kept here as the literal, citable source of that path data — if an icon ever
needs to be re-synced or a new one added, re-download the matching file from
the same package/version (or a newer one, re-verified) rather than editing the
`d` attribute by hand.

Filename → `Icon.jsx` name mapping (a few were renamed to the closest
matching Material Symbols icon, since Google doesn't have e.g. a "leaf" or
"cloudSun" icon under those exact names):

| File | `Icon.jsx` name | Used for |
|---|---|---|
| `home.svg` | `home` | Dashboard nav |
| `eco.svg` | `leaf` | Crop Guide nav |
| `search.svg` | `search` | Search |
| `partly_cloudy_day.svg` | `cloudSun` | Weather |
| `person.svg` | `user` | Profile nav |
| `history.svg` | `history` | Scan History nav |
| `inbox.svg` | `inbox` | Advisory ("Ask an Expert") |
| `chat.svg` | `chat` | Chatbot |
| `location_on.svg` | `pin` | Locator (nearby services) |
| `play_circle.svg` | `play` | Learning videos |
| `visibility.svg` | `eye` | Password show/hide |
| `visibility_off.svg` | `eyeOff` | Password show/hide |
