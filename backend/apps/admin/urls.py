from django.urls import path

from .views import BanUserView, DeleteReportView, SuspendUserView

app_name = 'admin_api'

urlpatterns = [
    path('reports/<uuid:report_id>/', DeleteReportView.as_view(), name='delete-report'),
    path('users/<uuid:user_id>/suspend/', SuspendUserView.as_view(), name='suspend-user'),
    path('users/<uuid:user_id>/ban/', BanUserView.as_view(), name='ban-user'),
]
