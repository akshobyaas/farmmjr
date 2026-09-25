from rest_framework.permissions import BasePermission


class IsScanOwner(BasePermission):
    """
    Object-level authorization check for a single scan record (Phase 12).
    Mirrors accounts.permissions.IsProfileOwner exactly, for the same
    reason: being logged in only proves WHO you are -- this additionally
    checks that the scan being accessed actually belongs to the requesting
    user. Without this, any authenticated farmer could read ANY other
    farmer's scan result just by changing the ID in the URL.
    """

    message = "You do not have permission to access this scan."

    def has_object_permission(self, request, view, obj):
        return obj.user_id == request.user.id
