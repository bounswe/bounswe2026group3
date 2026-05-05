from rest_framework import permissions

from apps.users.models import AccountStatus, UserRole


def _account_is_active(user):
    return user.account_status == AccountStatus.ACTIVE


class IsPublic(permissions.BasePermission):
    def has_permission(self, request, view):
        return True


class IsUser(permissions.BasePermission):
    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.is_active
            and _account_is_active(request.user)
        )

class IsAuthority(permissions.BasePermission):
    def has_permission(self, request, view):
        return (
            request.user.is_authenticated
            and request.user.role == UserRole.INFRASTRUCTURE_AUTHORITY
            and _account_is_active(request.user)
        )

class IsAdmin(permissions.BasePermission):
    def has_permission(self, request, view):
        return request.user.is_authenticated and request.user.role == UserRole.ADMINISTRATOR