from django.contrib.auth.models import AbstractUser
from django.db import models


class AccountStatus(models.TextChoices):
    ACTIVE = "ACTIVE", "Active"
    SUSPENDED = "SUSPENDED", "Suspended"
    BANNED = "BANNED", "Banned"


class UserRole(models.TextChoices):
    GUEST = "GUEST", "Guest"
    REGISTERED_USER = "REGISTERED_USER", "Registered User"
    TRUSTED_CONTRIBUTOR = "TRUSTED_CONTRIBUTOR", "Trusted Contributor"
    INFRASTRUCTURE_AUTHORITY = "INFRASTRUCTURE_AUTHORITY", "Infrastructure Authority"
    ADMINISTRATOR = "ADMINISTRATOR", "Administrator"


class MobilityAidType(models.TextChoices):
    WHEELCHAIR = "WHEELCHAIR", "Wheelchair"
    ELECTRIC_WHEELCHAIR = "ELECTRIC_WHEELCHAIR", "Electric Wheelchair"
    WALKER = "WALKER", "Walker"
    CRUTCHES = "CRUTCHES", "Crutches"
    STROLLER = "STROLLER", "Stroller"
    HAND_CART = "HAND_CART", "Hand Cart"
    NONE = "NONE", "None"


class User(AbstractUser):
    role = models.CharField(
        max_length=30,
        choices=UserRole.choices,
        default=UserRole.REGISTERED_USER,
    )
    account_status = models.CharField(
        max_length=15,
        choices=AccountStatus.choices,
        default=AccountStatus.ACTIVE,
    )
    reputation_points = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "users"

    def __str__(self):
        return self.username


class MobilityProfile(models.Model):
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="mobility_profile",
    )
    mobility_aid_type = models.CharField(
        max_length=25,
        choices=MobilityAidType.choices,
        default=MobilityAidType.NONE,
    )
    additional_needs = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "mobility_profiles"

    def __str__(self):
        return f"{self.user.username} - {self.mobility_aid_type}"
