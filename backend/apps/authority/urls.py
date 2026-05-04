from django.urls import path

from . import views

app_name = 'authority'

urlpatterns = [
    path(
        'reports/<uuid:report_id>/resolve',
        views.ResolveReportView.as_view(),
        name='resolve-report',
    ),
]
