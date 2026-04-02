from rest_framework import permissions

from apps.users.models import UserRole


class IsPublic(permissions.BasePermission):
    def has_permission(self, request, view):
        return True


class IsUser(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.is_active

class IsAuthority(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == UserRole.INFRASTRUCTURE_AUTHORITY

class IsAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == UserRole.ADMINISTRATOR