from django.urls import path
from apps.users import views

app_name = 'users'

urlpatterns = [
    path('login/', views.LoginView.as_view(), name='login'),
    path('refresh/', views.RefreshView.as_view(), name='refresh'),
    path('logout/', views.LogoutView.as_view(), name='logout'),
    path('register', RegisterView.as_view(), name='register'),
]