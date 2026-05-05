from django.urls import path
from apps.reports import views

app_name = 'reports'

urlpatterns = [
    path('', views.ReportCreateView.as_view(), name='report-create'),
    path('<uuid:report_id>/upvote/', views.ReportUpvoteView.as_view(), name='report-upvote'),
    path('<uuid:report_id>/flag/', views.ReportFlagView.as_view(), name='report-flag'),
    path('<uuid:report_id>/confirm-resolution/', views.ConfirmResolutionView.as_view(), name='confirm-resolution'),
]
