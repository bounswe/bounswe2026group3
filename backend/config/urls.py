from django.contrib import admin
from django.urls import path, include

from apps.users.views import AuthorityDashboardView, ReportsView, MapObstaclesView

urlpatterns = [
    path('admin/', admin.site.urls),
    path('auth/', include('apps.users.urls')),# login, refresh, logout is in users/views.py
    path('map/obstacles/', MapObstaclesView.as_view()),
    path('reports/', ReportsView.as_view()),
    path('authority/dashboard/', AuthorityDashboardView.as_view()),
]






