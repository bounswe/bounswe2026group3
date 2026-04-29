from django.urls import path

from .views import DeleteReportView

app_name = 'admin_api'

urlpatterns = [
    path('reports/<uuid:report_id>/', DeleteReportView.as_view(), name='delete-report'),
]
