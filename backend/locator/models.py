from django.db import models

# No model needed for Phase 15 -- nearby services are fetched live from
# OpenStreetMap (Nominatim + Overpass) and briefly cached server-side (see
# views.py), never persisted to the DB.
