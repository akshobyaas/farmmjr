# Smart Farming Project

AI-Based Crop Disease Detection and Smart Farming Guidance System — B.E. Major Project, NIE, Dept. of ISE, Batch 27.

## Current Status: All 23 phases complete (Deployment on hold)

Phases 1–21 of the original plan, plus several follow-up passes (expanded automated testing, a live
end-to-end testing pass, two full visual redesigns, UI polish, and a dashboard redesign) are all
built and verified. **Phase 22 (Deployment) is intentionally on hold** — everything below runs
locally. Phase 23 (final documentation/presentation prep) is the only phase not yet started.

### What's built

- **Secure accounts** — JWT auth (short-lived access tokens, rotating/blacklisted refresh tokens),
  email verification and password reset via single-use self-expiring tokens, rate limiting on every
  endpoint, object-level authorization (a user's token cannot read another user's profile).
- **Crop guidance catalog** — soil/climate/planting info, lifecycle timeline, fertilizer schedule,
  and organic manure methods for each crop, publicly browsable.
- **AI crop disease detection** — upload a leaf photo, get a real CNN prediction (not a placeholder)
  with a confidence score, plus symptoms/prevention/treatment guidance for the detected disease.
- **Scan history** — every scan a farmer runs is saved and browsable later, with pagination.
- **Weather** — city search or "use my location," backed by a Django proxy in front of
  OpenWeatherMap (the browser never sees the API key; the app degrades to a plain-language message
  if no key is configured).
- **Learning videos** — searches YouTube's Data API through the same proxy pattern.
- **Nearby agriculture services locator** — list and map view (Leaflet) of nearby services.
- **Chatbot** — a basic FAQ-matching assistant for quick farming questions.
- **Admin/Expert advisory module** — farmers ask questions, an admin-role user answers them.
- **Multi-language support** — English, Kannada, and Hindi, covering UI chrome and all core pages.
- **A from-scratch Minimal visual theme** — one accent color, hairline borders, one typeface, flat
  icons, no gradients or shadows; applied consistently across every screen from a single CSS file.
- **200 automated tests** (97 backend, 103 frontend), all passing, plus repeated live end-to-end
  testing with a real headless browser against the real running app.

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

**Optional API keys** (the app runs fully without them; Weather, Learning Videos and the Farming
Diary's AI analysis just show a plain-language "unavailable" message until these are set in
`backend/.env`):
- `OPENWEATHER_API_KEY` — free key at https://openweathermap.org/api
- `YOUTUBE_API_KEY` — free key at https://console.cloud.google.com/apis/credentials (enable "YouTube Data API v3")
- `GEMINI_API_KEY` — free key at https://aistudio.google.com/apikey (Farming Diary AI analysis). The
  model defaults to `gemini-2.5-flash`; set `GEMINI_MODEL` only if Google retires that model name.

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
python manage.py test           # 97 tests, all passing
```

```bash
cd frontend
npm test                        # 22 test files / 103 tests, all passing
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
| `/api/auth/password-reset/request/` | POST | Request password reset link |
| `/api/auth/password-reset/confirm/` | POST | Set new password via emailed link |
| `/api/crops/` | GET | List all crops (public, supports `?search=`) |
| `/api/crops/<id>/` | GET | Full crop detail (public) |
| `/api/diseases/<id>/` | GET | Disease detail (public) |
| `/api/scans/upload/` | POST | Upload a crop image for AI disease detection (authenticated) |
| `/api/scans/history/` | GET | Paginated list of the caller's past scans (authenticated) |
| `/api/scans/history/<id>/` | GET | Full detail of one past scan (authenticated, owner-only) |
| `/api/weather/` | GET | Current conditions by city name or lat/lon (authenticated, proxied) |
| `/api/videos/search/` | GET | Search farming-related YouTube videos (authenticated, proxied) |
| `/api/locator/nearby/` | GET | Nearby agriculture services (authenticated, proxied) |
| `/api/chatbot/message/` | POST | Send a message, get an FAQ-matched or fallback reply (authenticated) |
| `/api/advisory/queries/` | GET, POST | List (own, or all if admin) / ask a question (authenticated) |
| `/api/advisory/queries/<id>/` | GET, PATCH | View / answer a specific question (authenticated, owner-or-admin) |

---

## Project Structure

```
smart-farming-project/
├── backend/
│   ├── config/              # Settings, root URL routing
│   ├── core/                # Health-check endpoint
│   ├── accounts/             # Custom User model + full auth API
│   ├── crops/                 # Crop/disease content + public browsing API, seed_demo_data command
│   ├── scans/                  # Scan upload (CNN inference), scan history
│   ├── weather/                # OpenWeatherMap proxy
│   ├── videos/                  # YouTube Data API proxy
│   ├── locator/                  # Nearby-services proxy
│   ├── chatbot/                   # FAQ-matching chat endpoint
│   ├── advisory/                   # Farmer ↔ admin Q&A
│   ├── media/                       # Uploaded scan images (gitignored)
│   ├── .env.example
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── api/                 # axios client, token storage, per-feature API helpers
│       ├── context/AuthContext.jsx
│       ├── components/           # Icon.jsx, BottomNav.jsx, ProtectedRoute.jsx, AppHeader
│       ├── i18n/locales/          # en.json, kn.json, hi.json
│       ├── App.css                # The entire visual design system (one file, every page)
│       └── pages/                 # One page + matching *.test.jsx per feature
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
- Image uploads are validated by actually parsing the file with Pillow (not trusting the file
  extension or browser-claimed MIME type), and filenames are always replaced server-side with a
  random UUID.
- Every third-party API call (weather, videos, locator) goes through a Django proxy — the browser
  never sees an API key, and every proxy degrades gracefully (400/503) instead of a raw 500.
- Mass-assignment protection throughout: server-controlled fields (role, verification status, etc.)
  are always left out of client-writable serializers.

## Known Limitations

- No real SMTP — verification/reset emails print to the console in dev.
- `DEBUG=True` and the production-only security settings (SSL/HSTS/secure cookies) are correctly
  dormant until deployment; no hosting target has been chosen yet.
- OpenWeatherMap/YouTube API keys aren't bundled — Weather and Learning Videos work fully once a key
  is added to `.env`, and degrade gracefully without one.
- A handful of auth-flow pages (register, resend-verification, reset-password, verify-email) still
  have some hardcoded English strings outside the otherwise-complete multi-language coverage.
- Advisory answers have no notification — a farmer has to return to "Ask an Expert" to check.
