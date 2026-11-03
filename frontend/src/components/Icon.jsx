/**
 * Phase 21 — UI Polish Pass. Updated later to use Google's Material Symbols icon
 * set (the "Google icons" the user asked for) instead of hand-drawn line icons.
 *
 * Each path below is copied byte-for-byte from the real SVG files in
 * assets/icons/material-symbols/ (downloaded via the official
 * @material-symbols/svg-400 npm package, not retyped or reconstructed from
 * memory — see that folder's README.md for exact provenance/license/version and
 * the filename-to-icon-name mapping). The component API is unchanged: every
 * call site still does <Icon name="x" size={22} /> with no changes needed there.
 *
 * Material Symbols SVGs are solid *filled* shapes on a 960x960 grid with a
 * flipped Y axis (viewBox="0 -960 960 960"), not open strokes on a 24x24 grid
 * like the icons this replaces — so the wrapper below now uses
 * fill="currentColor" with no stroke, and the new viewBox, instead of the old
 * fill="none"/stroke="currentColor" setup. currentColor still means every icon
 * automatically takes on whatever color its container sets (white in the header,
 * gray/green in the bottom nav) with no extra CSS needed anywhere it's used —
 * that behavior carries over unchanged.
 */
const PATHS = {
  home: <path d="M220-180h150v-250h220v250h150v-390L480-765 220-570v390Zm-60 60v-480l320-240 320 240v480H530v-250H430v250H160Zm320-353Z" />,
  leaf: <path d="M480-200q0-100-70-170t-170-70q0 100 70 170t170 70Zm44-220q18-18 18-44v-6q8 6 16.5 9t19.5 3q26 0 44-18t18-44q0-20-9.5-35T604-576q17-6 26.5-21t9.5-35q0-26-18-44t-44-18q-11 0-19.5 3t-16.5 9v-6q0-26-18-44t-44-18q-26 0-44 18t-18 44v6q-8-6-16.5-9t-19.5-3q-26 0-44 18t-18 44q0 20 9.5 35t26.5 21q-17 6-26.5 21t-9.5 35q0 26 18 44t44 18q11 0 19.5-3t16.5-9v6q0 26 18 44t44 18q26 0 44-18Zm-88-111.5Q418-549 418-576q0-26 18-44t44-18q26 0 44 18t18 44q0 27-18 44.5T480-514q-26 0-44-17.5ZM480-200q100 0 170-70t70-170q-100 0-170 70t-70 170ZM160-80q-33 0-56.5-23.5T80-160v-640q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v640q0 33-23.5 56.5T800-80H160Zm0-80h640v-640H160v640Zm0 0v-640 640Z" />,
  search: <path d="M796-121 533-384q-30 26-70 40.5T378-329q-108 0-183-75t-75-181q0-106 75-181t182-75q106 0 180.5 75T632-585q0 43-14 83t-42 75l264 262-44 44ZM377-389q81 0 138-57.5T572-585q0-81-57-138.5T377-781q-82 0-139.5 57.5T180-585q0 81 57.5 138.5T377-389Z" />,
  cloudSun: <path d="M457.5-57Q440-74 440-99q0-12 4.5-23t13.5-19l42-39 42 39q9 8 13.5 19t4.5 23q0 25-17.5 42T500-40q-25 0-42.5-17ZM362-100l-42-42 118-118 42 42-118 118Zm258-60-60-60 60-60 60 60-60 60Zm-360 0-60-60 60-60 60 60-60 60Zm40-160q-91 0-155.5-64.5T80-540q0-83 55-145t136-73q32-57 87.5-89.5T480-880q90 0 156.5 57.5T717-679q69 6 116 57t47 122q0 75-52.5 127.5T700-320H300Zm0-80h400q42 0 71-29t29-71q0-42-29-71t-71-29h-60v-40q0-66-47-113t-113-47q-48 0-87.5 26T333-704l-10 24h-25q-57 2-97.5 42.5T160-540q0 58 41 99t99 41Zm180-200Z" />,
  user: <path d="M234-276q51-39 114-61.5T480-360q69 0 132 22.5T726-276q35-41 54.5-93T800-480q0-133-93.5-226.5T480-800q-133 0-226.5 93.5T160-480q0 59 19.5 111t54.5 93Zm146.5-204.5Q340-521 340-580t40.5-99.5Q421-720 480-720t99.5 40.5Q620-639 620-580t-40.5 99.5Q539-440 480-440t-99.5-40.5ZM480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 83-31.5 156T763-197q-54 54-127 85.5T480-80Zm100-95.5q47-15.5 86-44.5-39-29-86-44.5T480-280q-53 0-100 15.5T294-220q39 29 86 44.5T480-160q53 0 100-15.5ZM523-537q17-17 17-43t-17-43q-17-17-43-17t-43 17q-17 17-17 43t17 43q17 17 43 17t43-17Zm-43-43Zm0 360Z" />,
  history: <path d="M477-120q-149 0-253-105.5T120-481h60q0 125 86 213t211 88q127 0 215-89t88-216q0-124-89-209.5T477-780q-68 0-127.5 31T246-667h105v60H142v-208h60v106q52-61 123.5-96T477-840q75 0 141 28t115.5 76.5Q783-687 811.5-622T840-482q0 75-28.5 141t-78 115Q684-177 618-148.5T477-120Zm128-197L451-469v-214h60v189l137 134-43 43Z" />,
  inbox: <path d="M880-80 720-240H320q-33 0-56.5-23.5T240-320v-40h440q33 0 56.5-23.5T760-440v-280h40q33 0 56.5 23.5T880-640v560ZM160-473l47-47h393v-280H160v327ZM80-280v-520q0-33 23.5-56.5T160-880h440q33 0 56.5 23.5T680-800v280q0 33-23.5 56.5T600-440H240L80-280Zm80-240v-280 280Z" />,
  chat: <path d="M240-399h313v-60H240v60Zm0-130h480v-60H240v60Zm0-130h480v-60H240v60ZM80-80v-740q0-24 18-42t42-18h680q24 0 42 18t18 42v520q0 24-18 42t-42 18H240L80-80Zm134-220h606v-520H140v600l74-80Zm-74 0v-520 520Z" />,
  pin: <path d="M529.5-510.5Q550-531 550-560t-20.5-49.5Q509-630 480-630t-49.5 20.5Q410-589 410-560t20.5 49.5Q451-490 480-490t49.5-20.5ZM480-159q133-121 196.5-219.5T740-552q0-118-75.5-193T480-820q-109 0-184.5 75T220-552q0 75 65 173.5T480-159Zm0 79Q319-217 239.5-334.5T160-552q0-150 96.5-239T480-880q127 0 223.5 89T800-552q0 100-79.5 217.5T480-80Zm0-480Z" />,
  play: <path d="m383-310 267-170-267-170v340Zm97 230q-82 0-155-31.5t-127.5-86Q143-252 111.5-325T80-480q0-83 31.5-156t86-127Q252-817 325-848.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 82-31.5 155T763-197.5q-54 54.5-127 86T480-80Zm0-60q142 0 241-99.5T820-480q0-142-99-241t-241-99q-141 0-240.5 99T140-480q0 141 99.5 240.5T480-140Zm0-340Z" />,
  eye: <path d="M600.5-379.5Q650-429 650-500t-49.5-120.5Q551-670 480-670t-120.5 49.5Q310-571 310-500t49.5 120.5Q409-330 480-330t120.5-49.5Zm-200-41Q368-453 368-500t32.5-79.5Q433-612 480-612t79.5 32.5Q592-547 592-500t-32.5 79.5Q527-388 480-388t-79.5-32.5ZM216-283Q98-366 40-500q58-134 176-217t264-83q146 0 264 83t176 217q-58 134-176 217t-264 83q-146 0-264-83Zm264-217Zm222.5 174.5Q804-391 857-500q-53-109-154.5-174.5T480-740q-121 0-222.5 65.5T102-500q54 109 155.5 174.5T480-260q121 0 222.5-65.5Z" />,
  eyeOff: <path d="m629-419-44-44q26-71-27-118t-115-24l-44-44q17-11 38-16t43-5q71 0 120.5 49.5T650-500q0 22-5.5 43.5T629-419Zm129 129-40-40q49-36 85.5-80.5T857-500q-50-111-150-175.5T490-740q-42 0-86 8t-69 19l-46-47q35-16 89.5-28T485-800q143 0 261.5 81.5T920-500q-26 64-67 117t-95 93Zm58 226L648-229q-35 14-79 21.5t-89 7.5q-146 0-265-81.5T40-500q20-52 55.5-101.5T182-696L56-822l42-43 757 757-39 44ZM223-654q-37 27-71.5 71T102-500q51 111 153.5 175.5T488-260q33 0 65-4t48-12l-64-64q-11 5-27 7.5t-30 2.5q-70 0-120-49t-50-121q0-15 2.5-30t7.5-27l-97-97Zm305 142Zm-116 58Z" />,
  // Added for the Profile page's grouped-settings-list redesign (phone
  // number row). Sourced the same way as every icon above: the official
  // @material-symbols/svg-400@0.48.0 npm package, outlined/400/0/0 --
  // see this folder's README.md for the exact provenance note.
  call: <path d="M795-120q-116 0-236.5-56T335-335Q232-438 176-558.5T120-795q0-19.29 12.86-32.14Q145.71-840 165-840h140q14 0 24 10t14 25l26.93 125.64Q372-665 369.5-653.5t-10.73 19.73L259-533q26 44 55 82t64 72q37 38 78 69.5t86 55.5l95-98q10-11 23.15-15 13.15-4 25.85-2l119 26q15 4 25 16.04 10 12.05 10 26.96v135q0 19.29-12.86 32.14Q814.29-120 795-120ZM229-588l81-82-23-110H180q2 42 13.5 88.5T229-588Zm369 363q41 19 89 31t93 14v-107l-103-21-79 83ZM229-588Zm369 363Z" />,
  // Not from the Material Symbols package (see the file-level note above) --
  // a small custom-drawn chevron hexagon for the "this row is tappable"
  // affordance on list-row-style cards (UI Polish Pass, RoadBee-inspired).
  // Plain geometric arrow, same 960-grid/flipped-Y coordinate system as
  // every other icon here so it drops in at any call site unchanged.
  chevronRight: <path d="M360-660 600-480 360-300 330-340 570-480 330-620Z" />,
  // Weather pre-search redesign (design.md's "clear action after text is
  // entered" requirement on the location search field) -- same
  // @material-symbols/svg-400@0.48.0 package/version as every other icon
  // above, see this folder's README.md.
  close: <path d="m249-207-42-42 231-231-231-231 42-42 231 231 231-231 42 42-231 231 231 231-42 42-231-231-231 231Z" />,
  // Weather search-card restyle (user-supplied reference mockup) -- the
  // crosshair/GPS icon on "Use My Location", distinct from the teardrop
  // `pin` icon above (that one marks a place; this one means "locate me").
  // Same package/version as every other icon, see this folder's README.md.
  myLocation: <path d="M450-42v-75q-137-14-228-105T117-450H42v-60h75q14-137 105-228t228-105v-75h60v75q137 14 228 105t105 228h75v60h-75q-14 137-105 228T510-117v75h-60Zm244.5-223.5Q784-355 784-480t-89.5-214.5Q605-784 480-784t-214.5 89.5Q176-605 176-480t89.5 214.5Q355-176 480-176t214.5-89.5Zm-321-108Q330-417 330-480t43.5-106.5Q417-630 480-630t106.5 43.5Q630-543 630-480t-43.5 106.5Q543-330 480-330t-106.5-43.5ZM544-416q26-26 26-64t-26-64q-26-26-64-26t-64 26q-26 26-26 64t26 64q26 26 64 26t64-26Zm-64-64Z" />,
  // Chatbot voice-input mic button. User-supplied directly (Google's
  // Material Symbols icon-font-site export, 24dp/wght400/GRAD0/opsz24,
  // baked-in #e3e3e3 fill -- same kind of exception as the four noted in
  // this folder's README.md), but unlike those four, this one's path data
  // is genuinely on the native 24x24 grid (viewBox="0 0 24 24"), not the
  // 960-grid every other icon here shares -- see VIEWBOXES below, which is
  // what lets one icon opt out of the shared viewBox without disturbing
  // any other call site.
  mic: <path d="M9.88,13.13Q9,12.25 9,11V5Q9,3.75 9.88,2.88T12,2t2.13,0.88T15,5v6q0,1.25-0.88,2.13T12,14T9.88,13.13ZM12,8ZM11,21V17.93Q8.4,17.58 6.7,15.6T5,11H7q0,2.07 1.46,3.54T12,16t3.54-1.46T17,11h2q0,2.63-1.7,4.6T13,17.93V21H11Zm1.71-9.29Q13,11.43 13,11V5q0-0.43-0.29-0.71T12,4T11.29,4.29T11,5v6q0,0.42 0.29,0.71T12,12t0.71-0.29Z" />,
  // Mic-muted counterpart to the icon above, from the same user-supplied
  // export. Not wired into any page yet -- no current UI represents a
  // "muted mic" state -- but kept here, ready, rather than left unused: see
  // the README's provenance note.
  micOff: <path d="M17.75,14.95L16.3,13.5q0.35-0.58 0.52-1.2T17,11h2q0,1.1-0.32,2.09q-0.32,0.99-0.93,1.86ZM12,9.15Zm2.8,2.8L13,10.15V5q0-0.43-0.29-0.71T12,4T11.29,4.29T11,5V8.15l-2-2V5Q9,3.75 9.88,2.88T12,2t2.13,0.88T15,5v6q0,0.27-0.06,0.5T14.8,11.95ZM11,21V17.93Q8.4,17.58 6.7,15.6T5,11H7q0,2.07 1.44,3.54T12,16q0.85,0 1.61-0.26Q14.38,15.48 15,15l1.43,1.43Q15.7,17 14.84,17.4T13,17.93V21H11Zm8.8,1.6L1.4,4.2L2.8,2.8L21.2,21.2l-1.4,1.4Z" />,
  // Chatbot voice-OUTPUT toggle ("read replies aloud" on/off). Same
  // user-supplied-export story and native 24x24 grid as mic/micOff above
  // -- see VIEWBOXES below and this folder's README.md.
  volumeUp: <path d="M14,20.73V18.68q2.25-0.65 3.63-2.5T19,11.98t-1.38-4.2Q16.25,5.93 14,5.27V3.22q3.1,0.7 5.05,3.14T21,11.98t-1.95,5.61T14,20.73ZM3,15V9H7l5-5V20L7,15H3Zm11,1V7.95Q15.18,8.5 15.84,9.6T16.5,12q0,1.27-0.66,2.36T14,16ZM10,8.85L7.85,11H5v2H7.85L10,15.15V8.85ZM7.5,12Z" />,
  volumeOff: <path d="M19.8,22.6l-3.02-3.03q-0.63,0.4-1.33,0.69T14,20.73V18.68q0.35-0.13 0.69-0.25q0.34-0.13 0.64-0.3L12,14.8V20L7,15H3V9H6.2L1.4,4.2L2.8,2.8L21.2,21.2l-1.4,1.4Zm-0.2-5.8l-1.45-1.45q0.42-0.78 0.64-1.63T19,11.98q0-2.35-1.38-4.2Q16.25,5.93 14,5.27V3.22q3.1,0.7 5.05,3.14T21,11.98q0,1.32-0.36,2.55T19.6,16.8Zm-3.35-3.35L14,11.2V7.95Q15.18,8.5 15.84,9.6T16.5,12q0,0.38-0.06,0.74t-0.19,0.71ZM12,9.2L9.4,6.6L12,4V9.2Zm-2,5.95V12.8L8.2,11H5v2H7.85L10,15.15ZM9.1,11.9Z" />,
  // Scan Upload page's empty-state dropzone ("tap to choose a photo").
  // Same user-supplied-export story and native 24x24 grid as mic/volumeUp
  // above -- see VIEWBOXES below and this folder's README.md.
  imageSearch: <path d="M6,17H18l-3.07-4.1q-0.28-0.05-0.56-0.13T13.8,12.6L11.25,16L9,13L6,17ZM5,21q-0.83,0-1.41-0.59T3,19V5Q3,4.17 3.59,3.59T5,3h5q0,0.45 0,0.95T10,5H5V19H19V13.68l2,2V19q0,0.82-0.59,1.41T19,21H5Zm7-9Zm9.55,1.4l-3.1-3.1q-0.52,0.35-1.13,0.53Q16.73,11 16.05,11Q14.2,11 12.9,9.69T11.6,6.5t1.31-3.19T16.1,2t3.19,1.31T20.6,6.5q0,0.68-0.2,1.3q-0.2,0.62-0.5,1.15L22.95,12l-1.4,1.4ZM16.1,9q1.05,0 1.77-0.73T18.6,6.5T17.88,4.72T16.1,4T14.33,4.72T13.6,6.5t0.72,1.77T16.1,9Z" />,
  // Scan Upload page's "Take Photo" (direct camera capture) button. Same
  // user-supplied-export story and native 24x24 grid as above.
  photoCamera: <path d="M12,17.5q1.88,0 3.19-1.31T16.5,13T15.19,9.81T12,8.5T8.81,9.81T7.5,13t1.31,3.19T12,17.5Zm0-2q-1.05,0-1.77-0.72T9.5,13t0.73-1.78T12,10.5t1.78,0.72T14.5,13t-0.72,1.78T12,15.5ZM4,21q-0.82,0-1.41-0.59T2,19V7Q2,6.18 2.59,5.59T4,5H7.15L9,3h6l1.85,2H20q0.83,0 1.41,0.59Q22,6.18 22,7V19q0,0.82-0.59,1.41T20,21H4Zm0-2H20V7H15.95L14.13,5H9.88L8.05,7H4V19Zm8-6Z" />,
};

// Per-icon viewBox override for the rare icon (see `mic`/`micOff` above)
// whose source file's path data is on the native 24x24 grid instead of
// the 960-grid every other icon in PATHS shares. Anything not listed here
// uses the default below.
const VIEWBOXES = {
  mic: "0 0 24 24",
  micOff: "0 0 24 24",
  volumeUp: "0 0 24 24",
  volumeOff: "0 0 24 24",
  imageSearch: "0 0 24 24",
  photoCamera: "0 0 24 24",
};

export default function Icon({ name, size = 22, className = "" }) {
  const path = PATHS[name];
  if (!path) return null;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={VIEWBOXES[name] || "0 -960 960 960"}
      fill="currentColor"
      aria-hidden="true"
    >
      {path}
    </svg>
  );
}
