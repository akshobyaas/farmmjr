from rest_framework.permissions import BasePermission


class IsQueryOwnerOrAdmin(BasePermission):
    """
    A farmer can only see their own advisory queries; an admin/expert can
    see (and, via IsAdminExpert, answer) any of them. Mirrors
    accounts.permissions.IsProfileOwner but also lets the admin role
    through, the same object-level-vs-authentication split used there.
    """

    message = "You do not have permission to access this query."

    def has_object_permission(self, request, view, obj):
        user = request.user
        return obj.farmer_id == user.id or user.role == user.Role.ADMIN


class IsAdminExpert(BasePermission):
    """
    Only an admin/expert account may answer a farmer's advisory query --
    not even the farmer who asked it.
    """

    message = "Only an admin/expert account can answer advisory queries."

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and user.role == user.Role.ADMIN)
