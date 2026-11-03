# Google Material Symbols — source icons

The 21 SVG files in this folder are the real, unmodified artwork from Google's
**Material Symbols** icon set (the "Google icons" referenced in `Icon.jsx`),
downloaded verbatim via the official npm package rather than hand-drawn or
reconstructed from memory:

- Package: `@material-symbols/svg-400@0.48.0`
- Style: Outlined, default weight (400) / grade (0) / fill (0)
- Upstream source: https://github.com/google/material-design-icons
- License: Apache License 2.0 (same as the upstream repo's `LICENSE`)
- `weather_mix.svg`, `account_circle.svg`, `yard.svg`, and `forum.svg` are four exceptions: the user
  supplied those exact files directly (Google's Material Symbols icon-font-site exports,
  `24dp`/`wght400`/`GRAD0`/`opsz24`, each with a baked-in `#e3e3e3` fill) to replace the originally
  npm-sourced `partly_cloudy_day.svg` (weather icon), `person.svg` (profile icon), `eco.svg` (crop
  guidance icon), and `inbox.svg` (Ask an Expert icon). Saved verbatim as given, under shorter
  filenames for consistency with the rest of this folder. Only the `<path d="...">` data is actually
  used (by `Icon.jsx`); the files' own `width`/`height`/`fill` attributes are cosmetic metadata from
  that export and aren't read by the app.
- `mic.svg` and `mic_off.svg` are a further two exceptions, same user-supplied-export story as the
  four above (`24dp`/`wght400`/`GRAD0`/`opsz24`, baked-in `#e3e3e3` fill, ignored by the app) --
  **except these two are genuinely on the native 24x24 grid** (`viewBox="0 0 24 24"`), not the
  960-grid the other 13 files (including the four exceptions above) all happen to share. `Icon.jsx`
  therefore has a small `VIEWBOXES` override map so these two render at their own native viewBox
  instead of the shared `"0 -960 960 960"` -- every other icon is unaffected. `mic.svg` is wired in
  (Chatbot's voice-input button); `mic_off.svg` is saved and mapped to `Icon.jsx`'s `micOff` name but
  not yet used anywhere -- the app has no "muted microphone" UI state today.
- `volume_up.svg` and `volume_off.svg` are the same story again, same `24dp` native-grid exception as
  `mic.svg`/`mic_off.svg` just above (also covered by the `VIEWBOXES` override). Both are wired in --
  Chatbot's voice-output toggle swaps between them to show whether replies are being read aloud.
- `image_search.svg` and `photo_camera.svg` are the same story again, same `24dp` native-grid
  exception (also covered by the `VIEWBOXES` override). Both are wired into the Scan Upload page --
  `image_search` in the empty dropzone's placeholder, `photo_camera` on the "Take Photo" button.
  Their matching `tapToChoose`/`takePhoto` i18n strings (all three locales) had their own leftover
  📷/📸 emoji prefixes stripped once the real icons took over, the same way `myLocation`'s emoji was
  stripped when that icon was wired in -- otherwise the icon and the old emoji would have doubled up.

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
| `yard.svg` | `leaf` | Crop Guide nav |
| `search.svg` | `search` | Search |
| `weather_mix.svg` | `cloudSun` | Weather |
| `account_circle.svg` | `user` | Profile nav |
| `history.svg` | `history` | Scan History nav |
| `forum.svg` | `inbox` | Advisory ("Ask an Expert") |
| `chat.svg` | `chat` | Chatbot |
| `location_on.svg` | `pin` | Locator (nearby services) |
| `play_circle.svg` | `play` | Learning videos |
| `visibility.svg` | `eye` | Password show/hide |
| `visibility_off.svg` | `eyeOff` | Password show/hide |
| `call.svg` | `call` | Profile phone number row |
| `close.svg` | `close` | Weather location search field's clear button |
| `my_location.svg` | `myLocation` | Weather "Use My Location" button |
| `mic.svg` | `mic` | Chatbot voice-input button |
| `mic_off.svg` | `micOff` | Not used yet -- no "muted mic" UI exists today |
| `volume_up.svg` | `volumeUp` | Chatbot voice-output toggle (on) |
| `volume_off.svg` | `volumeOff` | Chatbot voice-output toggle (off) |
| `image_search.svg` | `imageSearch` | Scan Upload page's empty dropzone |
| `photo_camera.svg` | `photoCamera` | Scan Upload page's "Take Photo" button |
