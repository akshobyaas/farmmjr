from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import User


@admin.register(User)
class CustomUserAdmin(UserAdmin):
    """
    Extends Django's built-in UserAdmin so password hashing / change-password
    flows keep working correctly (never build custom password fields by hand).
    """
    fieldsets = UserAdmin.fieldsets + (
        ("Smart Farming Profile", {"fields": ("role", "preferred_language", "phone_number")}),
    )
    list_display = ("username", "email", "role", "is_verified", "preferred_language", "is_staff")
    list_filter = ("role", "is_verified", "preferred_language", "is_staff")
