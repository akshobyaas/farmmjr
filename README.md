# Smart Farming Project

AI-Based Crop Disease Detection and Smart Farming Guidance System — B.E. Major Project, NIE, Dept. of ISE, Batch 27.

## Current Status: Phase 8 ✅ Complete — Phase 9 (CNN Model) Next

Phases 1–8 are fully complete (backend + frontend + tests, all verified). Phase 9 (CNN model
training) is next — see `PROJECT_STATUS.md` (in the handoff package root) for the full phase plan.

### What's built (Phases 1–7, all complete)
- Django + DRF backend, React (Vite) frontend, connected via REST API
- `.env`-based secrets, CORS locked down, rate limiting on every endpoint
- Full JWT auth: register, login, logout (with real token blacklisting), refresh, `/me/`
- Email verification required before login; full forgot-password flow — both using single-use, self-expiring tokens
- Object-level authorization (`IsProfileOwner`) — proven via direct testing that one user cannot access another's profile
- Public crop guidance catalog: 7 crops with soil/climate/planting info, lifecycle timeline, fertilizer schedule, organic manure methods
- 21 automated frontend tests (Vitest + React Testing Library), all passing
- 40+ manual backend API tests across all phases (see each phase's detailed notes in `PROJECT_STATUS.md`)

### What's built (Phase 8, now complete)
- `ScanUploadView` — authenticated image upload endpoint (`POST /api/scans/upload/`)
- Real image validation: Pillow actually parses the file (not just checking extension/MIME claim)
- File size capped at 5MB, enforced both in Django settings and the serializer
- **Filenames are never trusted from the client** — every upload is renamed server-side to a random UUID + the verified extension
- Per-user upload rate limiting (10/minute)
- `ScanUploadPage.jsx` — file picker with image preview, upload, and plain-language error handling, wired into the dashboard at `/scan`
- 5 new automated frontend tests (26 total); 9 direct backend test cases run against a live server

**What Was Actually Tested (Phase 8):**
1. Valid JPEG upload → 201, placeholder message, `scan` object returned. ✅
2. Uploaded file renamed server-side to a random UUID (confirmed on disk, not the original filename). ✅
3. Oversized valid image (13.7MB) → 400, "Image too large. Maximum size is 5MB." ✅
4. Non-image file renamed to `.jpg` → 400, "This file is not a valid image." (Pillow catches it regardless of extension). ✅
5. No auth token → 401. ✅
6. Path-traversal filename (`../../../../etc/passwd.jpg`) → accepted as a valid image but saved under a safe UUID name; no file escaped `media/`. ✅
7. 12 rapid uploads as one user → first 5 succeeded, then 429 (`scan_upload` throttle, 10/min). ✅
8. Regression pass: `/api/ping/`, login, cross-user profile access (403), crop list — all still correct. ✅
9. Frontend: preview render, successful upload shows the placeholder message, oversized file rejected client-side before any API call, server validation errors and network failures both shown in plain language without crashing. ✅ (`npm test` — 26/26 passing)

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
python manage.py seed_demo_data         # populates 7 crops + 2 pre-verified test farmers
python manage.py runserver
```

Backend now runs at `http://localhost:8000`. Emails print to this terminal (console backend).

Test accounts from the seed command (pre-verified, ready to log in immediately):
- `farmer_ravi` / `FarmerPass#123` (Kannada preference)
- `farmer_asha` / `FarmerPass#123` (Hindi preference)

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
cd frontend
npm test
```

Should show 7 test files, 26 tests, all passing.

---

## Full Auth API Reference

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/ping/` | GET | Health check (Phase 1) |
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
| `/api/scans/upload/` | POST | Upload a crop image (authenticated, Phase 8 — tested, see checklist above) |

---

## Project Structure

```
smart-farming-project/
├── backend/
│   ├── config/              # Settings, URLs
│   ├── core/                 # Health-check app (Phase 1)
│   ├── accounts/              # Custom User model + full auth API (Phase 2-3-5-6)
│   │   ├── serializers.py, views.py, permissions.py, tokens.py, utils.py, throttles.py, urls.py
│   ├── crops/                 # Crop content + public browsing API (Phase 2, 7)
│   │   ├── serializers.py, views.py, urls.py
│   │   └── management/commands/seed_demo_data.py
│   ├── scans/                  # ScanHistory + secure upload (Phase 2, 8)
│   │   ├── serializers.py, views.py, throttles.py, urls.py
│   ├── advisory/               # AdvisoryQuery — schema ready, logic comes in Phase 17
│   ├── .env.example
│   └── requirements.txt
├── frontend/                   # React (Vite)
│   └── src/
│       ├── api/                # axios.js, tokenStorage.js, crops.js
│       ├── context/AuthContext.jsx
│       ├── components/ProtectedRoute.jsx (+ .test.jsx)
│       └── pages/
│           ├── LoginPage.jsx (+ .test.jsx), RegisterPage.jsx
│           ├── DashboardPage.jsx, ProfilePage.jsx (+ .test.jsx)
│           ├── CropListPage.jsx (+ .test.jsx), CropDetailPage.jsx (+ .test.jsx)
│           ├── ForgotPasswordPage.jsx (+ .test.jsx), ResetPasswordPage.jsx
│           ├── VerifyEmailPage.jsx, ResendVerificationPage.jsx
│           └── ScanUploadPage.jsx (+ .test.jsx)
└── .gitignore
```

## Key Security Decisions (cumulative, all phases)

- Custom `User` model set up in Phase 2, before any migration existed — swapping later is painful.
- JWT access tokens are short-lived (15 min); refresh tokens rotate on every use and are blacklisted afterward.
- Reset/verification tokens are single-use **by construction** (folded into a hash with the password/verification state), not via a "used tokens" database table.
- Object-level authorization (`IsProfileOwner`) is separate from authentication — proven by directly testing that one user's token cannot access another user's profile by ID substitution.
- Public endpoints (crop catalog) are GET-only by construction (`ListAPIView`/`RetrieveAPIView`), not by a permission check that could be misconfigured later.
- Image uploads are validated by actually parsing the file with Pillow (not trusting file extension or browser-claimed MIME type), and filenames are always replaced server-side with a random UUID.
- Known accepted trade-off: JWT tokens live in `localStorage`, not httpOnly cookies (documented in `tokenStorage.js`) — simpler while the team learns, flagged honestly rather than hidden.

See `PROJECT_STATUS.md` (in the handoff package root) for the full phase-by-phase history, and
`Development_Phase_Plan.md` (in `reference-docs/`) for the complete 23-phase roadmap.

## Next Up: Phase 9 — CNN Model: Dataset & First Training Run

This is different work than everything so far — it happens in a separate `ml-training/` directory
(NOT inside `backend/`), using notebooks rather than Django code: a PlantVillage subset (4–5 crops
to start), transfer learning with MobileNetV2, real accuracy/precision/recall/F1 numbers from an
actual training run, and a versioned saved model + label mapping. See `Development_Phase_Plan.md`
for the full task/security/testing checklist.
