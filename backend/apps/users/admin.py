from django.contrib import admin

from .models import MobilityProfile, User


@admin.register(User)
class UserAdmin(admin.ModelAdmin):
    list_display = ('email', 'full_name', 'role', 'account_status', 'reputation_points')
    list_filter = ('role', 'account_status')
    search_fields = ('email', 'full_name')
    ordering = ('email',)
    fields = (
        'email', 'full_name', 'birth_date',
        'role', 'account_status',
        'reputation_points', 'notifications_enabled',
        'is_active', 'is_staff',
        'created_at', 'updated_at',
    )
    readonly_fields = ('created_at', 'updated_at')


@admin.register(MobilityProfile)
class MobilityProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'mobility_aid_type', 'avoid_stairs', 'avoid_steep_slopes')
    list_filter = ('mobility_aid_type',)
    search_fields = ('user__email',)
