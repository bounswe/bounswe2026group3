from django.urls import path

from . import views

app_name = 'places'

urlpatterns = [
    path('', views.SavedPlaceListCreateView.as_view(), name='saved-place-list-create'),
    path('<uuid:place_id>/', views.SavedPlaceDetailView.as_view(), name='saved-place-detail'),
]
