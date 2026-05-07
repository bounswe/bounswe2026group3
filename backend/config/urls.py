from django.contrib import admin
from django.db import connection
from django.http import JsonResponse
from django.urls import include, path

from apps.users.views import MobilityProfileView


def health(request):
    try:
        connection.ensure_connection()
        return JsonResponse({"status": "ok", "db": "connected"})
    except Exception:
        return JsonResponse({"status": "error", "db": "unreachable"}, status=503)


urlpatterns = [
    path('health/', health),
    path('admin/', admin.site.urls),
    path('api/auth/', include('apps.users.urls')),
    path('api/routes/', include('apps.routing.urls')),
    path('api/reports/', include('apps.reports.urls')),
    path('api/map/', include('apps.map.urls')),
    path('api/admin/', include('apps.admin.urls')),
    path('api/authority/', include('apps.authority.urls')),
    path('api/notifications/', include('apps.notifications.urls')),
    path('api/users/me/saved-places/', include('apps.places.urls')),
    path('api/users/me/mobility-profile', MobilityProfileView.as_view(), name='mobility-profile'),
]
