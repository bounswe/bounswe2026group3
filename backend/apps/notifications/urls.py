from django.urls import path

from . import views

app_name = 'notifications'

urlpatterns = [
    path('', views.NotificationListView.as_view(), name='notification-list'),
    path(
        '<int:notification_id>/read/',
        views.NotificationMarkReadView.as_view(),
        name='notification-mark-read',
    ),
]
