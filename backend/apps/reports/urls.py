from django.urls import path
from apps.reports import views

app_name = 'reports'

urlpatterns = [
    path('', views.ReportCreateView.as_view(), name='report-create'),
]
