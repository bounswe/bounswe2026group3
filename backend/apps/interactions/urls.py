from django.urls import path

from .views import ReportUpvoteView

app_name = "interactions"

urlpatterns = [
    path("<uuid:report_id>/upvote/", ReportUpvoteView.as_view(), name="report-upvote"),
]
