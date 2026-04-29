from django.urls import include, path

from apps.reports import views

app_name = 'reports'

urlpatterns = [
    path('', views.ReportCreateView.as_view(), name='report-create'),
    path('', include('apps.interactions.urls')),
]
