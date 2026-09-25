from rest_framework.permissions import BasePermission


class IsProfileOwner(BasePermission):
    """
    Object-level authorization check.

    This is deliberately separate from authentication (IsAuthenticated).
    Being logged in only proves WHO you are — this permission additionally
    checks that the profile object being accessed actually belongs to you.
    Without this, any authenticated user could read/edit ANY other user's
    profile just by changing the ID in the URL.
    """

    message = "You do not have permission to access this profile."

    def has_object_permission(self, request, view, obj):
        return obj.id == request.user.id
