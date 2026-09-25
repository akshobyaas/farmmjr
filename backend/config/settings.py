"""
Django settings for config project.
Accumulated through Phase 8 — secure foundations, JWT auth, email
verification/reset, object-level authorization, public crop content,
and secure image upload.
"""

from pathlib import Path
from datetime import timedelta
import environ

BASE_DIR = Path(__file__).resolve().parent.parent

# ---------------------------------------------------------------------------
# Environment variables (never hardcode secrets — see .env.example)
# ---------------------------------------------------------------------------
env = environ.Env(
    DEBUG=(bool, False),
)
environ.Env.read_env(BASE_DIR / '.env')

SECRET_KEY = env('SECRET_KEY')
DEBUG = env('DEBUG')
ALLOWED_HOSTS = env.list('ALLOWED_HOSTS', default=['localhost', '127.0.0.1'])

# ---------------------------------------------------------------------------
# Applications
# ---------------------------------------------------------------------------
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',

    # Third-party
    'rest_framework',
    'corsheaders',
    'rest_framework_simplejwt.token_blacklist',

    # Local apps
    'core',
    'accounts',
    'crops',
    'scans',
    'advisory',
    'weather',
    'videos',
    'locator',
    'chatbot',
]

# Must be set before the first migration involving auth — swapping later is painful.
AUTH_USER_MODEL = 'accounts.User'

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'corsheaders.middleware.CorsMiddleware',   # must sit high, before CommonMiddleware
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'

# ---------------------------------------------------------------------------
# Database — SQLite for now, Postgres later via env vars
# ---------------------------------------------------------------------------
DATABASES = {
    'default': {
        'ENGINE': env('DB_ENGINE', default='django.db.backends.sqlite3'),
        'NAME': BASE_DIR / env('DB_NAME', default='db.sqlite3'),
    }
}

# ---------------------------------------------------------------------------
# Password validation
# ---------------------------------------------------------------------------
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator', 'OPTIONS': {'min_length': 8}},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# ---------------------------------------------------------------------------
# Internationalization
# ---------------------------------------------------------------------------
LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True

# ---------------------------------------------------------------------------
# Static files
# ---------------------------------------------------------------------------
STATIC_URL = 'static/'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# ---------------------------------------------------------------------------
# Media files (user-uploaded images — scan photos, etc.) — Phase 8
# ---------------------------------------------------------------------------
MEDIA_URL = 'media/'
MEDIA_ROOT = BASE_DIR / 'media'

# Max upload size Django will parse into memory before erroring — matches
# our own 5MB application-level limit (enforced again in the serializer).
DATA_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024  # 5MB
FILE_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024

# ---------------------------------------------------------------------------
# CORS — only allow the React dev server, never wildcard
# ---------------------------------------------------------------------------
CORS_ALLOWED_ORIGINS = [
    env('FRONTEND_URL', default='http://localhost:5173'),
]
CORS_ALLOW_CREDENTIALS = True

# ---------------------------------------------------------------------------
# Django REST Framework
# ---------------------------------------------------------------------------
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
        'rest_framework.throttling.ScopedRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '30/minute',
        'user': '100/minute',
        # Tighter, dedicated limits for auth endpoints — these are brute-force targets.
        'login': '5/minute',
        'register': '5/minute',
        'password_reset': '3/minute',
        'scan_upload': '10/minute',
        'weather': '30/minute',
        'video_search': '20/minute',
        'locator_search': '15/minute',
        'chatbot': '30/minute',
        'advisory': '20/minute',
    },
}

# ---------------------------------------------------------------------------
# JWT settings — short-lived access token, rotating refresh token.
# ---------------------------------------------------------------------------
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=15),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'ROTATE_REFRESH_TOKENS': True,
    'BLACKLIST_AFTER_ROTATION': True,
    'UPDATE_LAST_LOGIN': True,
}

# ---------------------------------------------------------------------------
# Password reset / email verification tokens expire after 30 minutes.
# ---------------------------------------------------------------------------
PASSWORD_RESET_TIMEOUT = 1800  # 30 minutes, in seconds

# ---------------------------------------------------------------------------
# Email — console backend for dev (prints emails to the runserver terminal).
# Swap EMAIL_BACKEND to the SMTP backend with real creds in .env when ready.
# ---------------------------------------------------------------------------
EMAIL_BACKEND = env('EMAIL_BACKEND', default='django.core.mail.backends.console.EmailBackend')
DEFAULT_FROM_EMAIL = env('DEFAULT_FROM_EMAIL', default='noreply@smartfarming.test')
FRONTEND_URL_FOR_LINKS = env('FRONTEND_URL', default='http://localhost:5173')

# ---------------------------------------------------------------------------
# Weather (Phase 13) — OpenWeatherMap. Server-side only, never sent to the
# frontend. Left blank until a real key is added to .env; the weather view
# treats a blank key as "service unavailable" rather than crashing.
# ---------------------------------------------------------------------------
OPENWEATHER_API_KEY = env('OPENWEATHER_API_KEY', default='')

# ---------------------------------------------------------------------------
# Learning videos (Phase 14) — YouTube Data API v3. Server-side only, same
# blank-key-fails-soft pattern as OPENWEATHER_API_KEY above.
# ---------------------------------------------------------------------------
YOUTUBE_API_KEY = env('YOUTUBE_API_KEY', default='')

# ---------------------------------------------------------------------------
# Security headers (Phase 19 audit) -- made explicit rather than relying on
# Django's implicit defaults, so a reviewer can see the intent directly:
#   X-Content-Type-Options: nosniff        -- stops MIME-sniffing attacks
#   X-Frame-Options: DENY                  -- blocks clickjacking (all envs,
#                                              not just prod -- cheap and safe in dev too)
#   Referrer-Policy: same-origin           -- don't leak full URLs to third parties
#   Cross-Origin-Opener-Policy: same-origin -- isolates browsing context
# ---------------------------------------------------------------------------
SECURE_CONTENT_TYPE_NOSNIFF = True
X_FRAME_OPTIONS = 'DENY'
SECURE_REFERRER_POLICY = 'same-origin'
SECURE_CROSS_ORIGIN_OPENER_POLICY = 'same-origin'

# ---------------------------------------------------------------------------
# Production-only security settings (dormant in dev since DEBUG=True skips them)
# ---------------------------------------------------------------------------
if not DEBUG:
    SECURE_SSL_REDIRECT = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    CSRF_COOKIE_HTTPONLY = True
    SESSION_COOKIE_HTTPONLY = True
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True

# ---------------------------------------------------------------------------
# Logging (Phase 19 audit) -- structured auth-event logging (login success/
# failure, unverified-login-blocked) without ever logging passwords or
# tokens. Console-only for now, matching the dev email backend's console
# pattern; swap the 'auth' logger's handler for a file/aggregator in prod.
# ---------------------------------------------------------------------------
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'structured': {
            'format': '{asctime} [{levelname}] {name}: {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'structured',
        },
    },
    'loggers': {
        'smartfarming.auth': {
            'handlers': ['console'],
            'level': 'INFO',
            'propagate': False,
        },
        'django.security': {
            'handlers': ['console'],
            'level': 'WARNING',
            'propagate': False,
        },
    },
}
