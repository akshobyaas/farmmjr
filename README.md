# Smart Farming Project

AI-Based Crop Disease Detection and Smart Farming Guidance System — B.E. Major Project, NIE, Dept. of ISE, Batch 27.

## Current Status: All 23 phases complete, plus four major feature/USP passes (Deployment on hold)

Phases 1–21 of the original plan are built and verified. **Phase 22 (Deployment) is intentionally on
hold** — everything below runs locally. Phase 23 (final documentation/presentation prep) was folded
into the ongoing documentation work below rather than treated as a separate step.

Beyond the original 23-phase plan, four major passes have since been built, reviewed, and shipped:

- The **Crop Lifecycle Tracker** — per-crop growth-stage tracking, proactive weather-driven disease
  risk alerts, and a "Today's Tasks" dashboard card, all backed by real researched agronomy content.
- The **Farming Diary** — a daily activity log (irrigation/fertilizer/spraying/pruning/notes, with an
  optional photo run through the same CNN pipeline as a regular scan) plus a Gemini-backed AI analysis
  of each entry, failing soft to a plain-language message if no key is configured.
- The **Kannada Voice Assistant** — the chatbot is now a real Gemini-backed conversational assistant
  (not a fixed FAQ matcher), with Web Speech API voice input (mic button, speech-to-text) and voice
  output (auto-speaks replies) in English, Kannada, or Hindi.
- A **project-wide cleanup**, in three completed parts — splitting the frontend's single `App.css`
  into per-page CSS Modules plus a dedicated data hook per page, a dead-code/naming/duplication audit,
  and a backend restructure standardizing API response conventions and splitting two oversized files
  into per-feature modules — plus this documentation pass, the fourth and last part.

### What's built

- **Secure accounts** — JWT auth (short-lived access tokens, rotating/blacklisted refresh tokens),
  email verification and password reset via single-use self-expiring tokens, an in-flow "change my
  email" option if a farmer mistypes it at signup, rate limiting on every endpoint, object-level
  authorization (a user's token cannot read another user's profile).
- **Crop guidance catalog** — soil/climate/planting info, lifecycle timeline, fertilizer schedule,
  and organic manure methods for each of the 4 regional crops (Arecanut, Black Pepper, Cocoa, Rice),
  publicly browsable.
- **Crop Lifecycle Tracker** — a farmer tracks an active crop through its real growth stages; the app
  surfaces proactive, weather-forecast-driven disease risk alerts for the farmer's own location and
  active crop stage, plus a "Today's Tasks" dashboard card pulled from real stage-specific agronomy
  guidance.
- **Farming Diary** — a one-entry-per-day log per tracked crop (idempotent same-day resubmission),
  with structured activity checkboxes, a free-text note, an optional photo (run through the CNN model),
  and a short Gemini-generated analysis grounded in the entry plus recent diary history.
- **AI crop disease detection** — upload a leaf photo, get a real CNN prediction (not a placeholder)
  with a confidence score, plus symptoms/prevention/treatment guidance for the detected disease. A
  low-confidence result nudges the farmer toward "Ask an Expert," pre-filling the question and
  notifying an admin by email.
- **Scan history** — every scan a farmer runs is saved and browsable later, with pagination.
- **Weather** — city search or "use my location," backed by a Django proxy in front of
  OpenWeatherMap (the browser never sees the API key; the app degrades to a plain-language message
  if no key is configured).
- **Learning videos** — searches YouTube's Data API through the same proxy pattern.
- **Nearby agriculture services locator** — list and map view (Leaflet) of nearby services.
- **Kannada Voice Assistant chatbot** — a real Gemini-backed conversational assistant (not a fixed
  FAQ matcher), with Web Speech API voice input and output in English, Kannada, or Hindi, failing
  soft to a plain-language message if no key is configured.
- **Admin/Expert advisory module** — farmers ask questions, an admin-role user answers them; a
  question that originates from a low-confidence scan nudge emails admins automatically.
- **Multi-language support** — English, Kannada, and Hindi, covering UI chrome, all core pages, and
  a global language switcher; a handful of auth-flow pages still have some hardcoded English (see
  Known Limitations).
- **A from-scratch Minimal visual theme** — one accent color, hairline borders, one typeface, flat
  Material Symbols icons, no gradients or shadows; applied consistently across every screen via
  shared design tokens, with each page's own styling split into its own CSS Module.
- **244 backend automated tests, 265 frontend automated tests**, all passing, plus repeated live
  end-to-end testing with a real headless browser against the real running app.

---

## Setup Instructions

### Prerequisites
- Python 3.10+
- Node.js 18+
- Git

### Backend Setup

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

pip install -r requirements.txt

cp .env.example .env
python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"
# Paste the output into .env as SECRET_KEY=...

python manage.py migrate
python manage.py createsuperuser        # create your own admin login
python manage.py seed_demo_data         # populates 4 crops + 3 pre-verified test accounts
python manage.py runserver
```

Backend now runs at `http://localhost:8000`. Emails print to this terminal (console backend) — there
is no real SMTP configured. The CNN model loads at server startup, so the first boot takes roughly
15–20 seconds; wait for "Starting development server" in the log.

**Optional API keys** (the app runs fully without them; the affected feature just shows a
plain-language "unavailable" message until the key is set in `backend/.env`):
- `OPENWEATHER_API_KEY` — free key at https://openweathermap.org/api (Weather)
- `YOUTUBE_API_KEY` — free key at https://console.cloud.google.com/apis/credentials, enabling
  "YouTube Data API v3" (Learning Videos)
- `GEMINI_API_KEY` — free key at https://aistudio.google.com/apikey (Farming Diary AI analysis, and
  the Kannada Voice Assistant chatbot). The model defaults to `gemini-2.5-flash`; set `GEMINI_MODEL`
  only if Google retires that model name.

Test accounts from the seed command (pre-verified, ready to log in immediately):
- `farmer_ravi` / `FarmerPass#123` (farmer role, Kannada preference)
- `farmer_asha` / `FarmerPass#123` (farmer role, Hindi preference)
- `admin_expert` / `AdminPass#123` (admin role — answers advisory questions)

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

Frontend now runs at `http://localhost:5173`.

### Running Both Together

Two terminals — one for Django, one for Vite. Both must be running simultaneously.

### Running Tests

```bash
cd backend
venv\Scripts\activate           # or: source venv/bin/activate
python manage.py test           # 244 tests, all passing
```

```bash
cd frontend
npx vitest run                  # 265 tests, all passing
npm run build                   # production build
```

---

## Full API Reference

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/ping/` | GET | Health check |
| `/api/auth/register/` | POST | Create account |
| `/api/auth/login/` | POST | Get access + refresh tokens (blocked until email verified) |
| `/api/auth/login/refresh/` | POST | Exchange refresh token for a new access token |
| `/api/auth/logout/` | POST | Blacklists the refresh token |
| `/api/auth/me/` | GET | Caller's own safe profile summary |
| `/api/auth/profile/<id>/` | GET, PATCH | Full profile view/edit — object-level authorization enforced |
| `/api/auth/verify-email/resend/` | POST | Resend verification email |
| `/api/auth/verify-email/confirm/` | POST | Confirm email via emailed link |
| `/api/auth/verify-email/change-email/` | POST | Correct a mistyped email before the account is verified |
| `/api/auth/password-reset/request/` | POST | Request password reset link |
| `/api/auth/password-reset/confirm/` | POST | Set new password via emailed link |
| `/api/crops/` | GET | List all crops (public, supports `?search=`) |
| `/api/crops/<id>/` | GET | Full crop detail (public) |
| `/api/crops/trackers/` | GET, POST | List the caller's crop trackers / start tracking a crop (authenticated) |
| `/api/crops/trackers/<id>/` | GET, PATCH, DELETE | View, update, or stop tracking a crop (authenticated, owner-only) |
| `/api/crops/diary/` | GET, POST | List diary entries for a tracker (`?tracker=`) / log today's entry (authenticated) |
| `/api/crops/diary/<id>/` | GET | View one diary entry (authenticated, owner-only) |
| `/api/crops/risk-alerts/` | GET | Weather-driven disease risk alerts for the caller's active trackers (authenticated) |
| `/api/crops/tasks/today/` | GET | Today's agronomy tasks across the caller's active trackers (authenticated) |
| `/api/diseases/<id>/` | GET | Disease detail (public) |
| `/api/scans/upload/` | POST | Upload a crop image for AI disease detection (authenticated) |
| `/api/scans/history/` | GET | Paginated list of the caller's past scans (authenticated) |
| `/api/scans/history/<id>/` | GET | Full detail of one past scan (authenticated, owner-only) |
| `/api/weather/` | GET | Current conditions by city name or lat/lon (authenticated, proxied) |
| `/api/videos/search/` | GET | Search farming-related YouTube videos (authenticated, proxied) |
| `/api/locator/nearby/` | GET | Nearby agriculture services (authenticated, proxied) |
| `/api/chatbot/message/` | POST | Send a message, get a Gemini-backed conversational reply (authenticated) |
| `/api/advisory/queries/` | GET, POST | List (own, or all if admin) / ask a question (authenticated) |
| `/api/advisory/queries/<id>/` | GET, PATCH | View / answer a specific question (authenticated, owner-or-admin) |

---

## Project Structure

```
smart-farming-project/
├── backend/
│   ├── config/                  # Settings, root URL routing
│   ├── core/                    # Health-check endpoint + shared api_responses.py fail-soft helpers
│   ├── accounts/                 # Custom User model + full auth API
│   ├── crops/                     # Catalog, Crop Lifecycle Tracker, Farming Diary, risk alerts,
│   │                                # today's tasks — split into per-feature views_*.py/serializers_*.py
│   ├── scans/                      # Scan upload (CNN inference), scan history, shared image validator
│   ├── weather/                     # OpenWeatherMap proxy
│   ├── videos/                       # YouTube Data API proxy
│   ├── locator/                       # Nearby-services proxy
│   ├── chatbot/                        # Gemini-backed conversational chat endpoint
│   ├── advisory/                        # Farmer ↔ admin Q&A, with low-confidence-scan email alerts
│   ├── media/                            # Uploaded scan images (gitignored)
│   ├── .env.example
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── api/                  # axios client, token storage, per-feature API helpers
│       ├── context/AuthContext.jsx
│       ├── components/            # Icon.jsx, AppHeader, BottomNav, LanguageSwitcher, PasswordInput,
│       │                            # LowConfidenceNudge, ProtectedRoute
│       ├── hooks/                   # One data-fetching hook per page (useWeather, useCropTracker, …)
│       ├── i18n/locales/              # en.json, kn.json, hi.json
│       ├── styles/                     # tokens.css, base.css, shared.css — the shared design system
│       └── pages/                       # One page + its own *.module.css + matching *.test.jsx
└── .gitignore
```

## Key Security Decisions

- Custom `User` model set up before any migration existed — swapping later is painful.
- JWT access tokens are short-lived (15 min); refresh tokens rotate on every use and are blacklisted
  afterward. Known accepted trade-off: tokens live in `localStorage`, not httpOnly cookies — simpler
  while the team learns, flagged honestly rather than hidden.
- Reset/verification tokens are single-use **by construction** (folded into a hash with the
  password/verification state), not via a "used tokens" database table.
- Object-level authorization (`IsProfileOwner` and equivalents) is separate from authentication —
  proven by directly testing that one user's token cannot access another user's resources by ID
  substitution.
- Public endpoints (crop catalog) are GET-only by construction (`ListAPIView`/`RetrieveAPIView`),
  not by a permission check that could be misconfigured later.
- Image uploads (both scans and Farming Diary photos) are validated by a single shared helper that
  actually parses the file with Pillow (not trusting the file extension or browser-claimed MIME type),
  and filenames are always replaced server-side with a random UUID.
- Every third-party API call (weather, videos, locator, Gemini) goes through a Django proxy — the
  browser never sees an API key, and every proxy degrades gracefully (400/503) instead of a raw 500.
- Mass-assignment protection throughout: server-controlled fields (role, verification status, etc.)
  are always left out of client-writable serializers.

## Known Limitations

- No real SMTP — verification/reset emails print to the console in dev.
- `DEBUG=True` and the production-only security settings (SSL/HSTS/secure cookies) are correctly
  dormant until deployment; no hosting target has been chosen yet.
- OpenWeatherMap/YouTube/Gemini API keys aren't bundled — the affected features work fully once a
  key is added to `.env`, and degrade gracefully without one.
- A handful of auth-flow pages (register, resend-verification, reset-password, verify-email) still
  have some hardcoded English strings outside the otherwise-complete multi-language coverage.
- A farmer isn't notified when their advisory question gets answered — they have to return to
  "Ask an Expert" to check. (The reverse direction — an admin being emailed when a low-confidence
  scan nudges a new question — is implemented.)
- The CNN model covers 9 of the 11 seeded diseases (3 Black Pepper, 4 Rice, 2 Arecanut); Cocoa has
  guidance content but no disease detection yet, and 2 specific diseases (Arecanut Foot Rot, Cocoa
  Vascular Streak Dieback) have no public training dataset found anywhere, as of the most recent
  survey.
