from django.urls import path
from apps.users import views

app_name = 'users'

urlpatterns = [
    path('login/', views.LoginView.as_view(), name='login'),
    path('refresh/', views.RefreshView.as_view(), name='refresh'),
    path('logout/', views.LogoutView.as_view(), name='logout'),

    ## Those are for the testing purposes, remove them later
    path('/map/obstacles', views.MapObstaclesView.as_view(), name='map-obstacles'),
    path('/reports', views.ReportsView.as_view(), name='reports'),
    path('/authority/dashboard', views.AuthorityDashboardView.as_view(), name='authority-dashboard'),
    path('register/', views.RegisterView.as_view(), name='register'),
    path('users/me', views.MeView.as_view(), name='users-me'),
]