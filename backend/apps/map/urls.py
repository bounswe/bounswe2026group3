from django.urls import path
from apps.map import views

app_name = "map"

urlpatterns = [
    path("obstacles/", views.ObstacleListView.as_view(), name="obstacle-list"),
    path("obstacles/<uuid:obstacle_id>/", views.ObstacleDetailView.as_view(), name="obstacle-detail"),
    path("search", views.SearchView.as_view(), name="search"),
]
