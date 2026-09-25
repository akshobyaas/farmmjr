from rest_framework.pagination import PageNumberPagination


class ScanHistoryPagination(PageNumberPagination):
    """
    Server-enforced pagination for the scan history list (Phase 12).
    page_size is client-adjustable via ?page_size=, but capped at
    max_page_size so a single request can't pull a farmer's entire
    history in one shot regardless of what the client asks for.
    """
    page_size = 10
    page_size_query_param = "page_size"
    max_page_size = 50
