from django.contrib import admin
from django.db import connection
from django.http import JsonResponse
from django.urls import include, path


def health(request):
    try:
        connection.ensure_connection()
        return JsonResponse({"status": "ok", "db": "connected"})
    except Exception:
        return JsonResponse({"status": "error", "db": "unreachable"}, status=503)


urlpatterns = [
    path('health/', health),
    path('admin/', admin.site.urls),
    path('auth/', include('apps.users.urls')),# login, refresh, logout is in users/views.py

    path('api/auth/', include('apps.users.urls')),
    path('api/routes/', include('apps.routing.urls')),
    path('api/reports/', include('apps.reports.urls')),
]
