from django.urls import path

from .views import DeleteReportView, ModerationQueueView

app_name = 'admin_api'

urlpatterns = [
    path('reports/moderation-queue/', ModerationQueueView.as_view(), name='moderation-queue'),
    path('reports/<uuid:report_id>/', DeleteReportView.as_view(), name='delete-report'),
]
