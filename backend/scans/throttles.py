from rest_framework.throttling import UserRateThrottle


class ScanUploadRateThrottle(UserRateThrottle):
    """
    Per-authenticated-user limit on image uploads. Uploads involve disk I/O
    and (from Phase 10 onward) an AI inference call, both meaningfully more
    expensive than a typical read request — a tighter, dedicated limit here
    prevents one user from hammering the upload pipeline.
    """
    scope = "scan_upload"
