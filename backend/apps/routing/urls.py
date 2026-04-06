from django.urls import path

from apps.routing.views import CalculateRouteView

urlpatterns = [
    path('calculate', CalculateRouteView.as_view(), name='calculate-route'),
]
