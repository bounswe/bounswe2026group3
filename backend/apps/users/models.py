import uuid

from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models


class AccountStatus(models.TextChoices):
    ACTIVE = 'ACTIVE', 'Active'
    SUSPENDED = 'SUSPENDED', 'Suspended'
    BANNED = 'BANNED', 'Banned'


class MobilityAidType(models.TextChoices):
    WHEELCHAIR = 'WHEELCHAIR', 'Wheelchair'
    ELECTRIC_WHEELCHAIR = 'ELECTRIC_WHEELCHAIR', 'Electric Wheelchair'
    WALKER = 'WALKER', 'Walker'
    CRUTCHES = 'CRUTCHES', 'Crutches'
    STROLLER = 'STROLLER', 'Stroller'
    HAND_CART = 'HAND_CART', 'Hand Cart'
    NONE = 'NONE', 'None'


class UserManager(BaseUserManager):
    def create_user(self, email, full_name, password=None, **extra_fields):
        if not email:
            raise ValueError('Email is required')
        email = self.normalize_email(email)
        user = self.model(email=email, full_name=full_name, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, full_name, password=None, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        return self.create_user(email, full_name, password, **extra_fields)

# Authorization
# No Guest User since it is not supposed to be in database
class UserRole(models.TextChoices):
    REGISTERED_USER = 'REGISTERED_USER', 'Registered User'
    TRUSTED_CONTRIBUTOR = 'TRUSTED_CONTRIBUTOR', 'Trusted Contributor'
    INFRASTRUCTURE_AUTHORITY = 'INFRASTRUCTURE_AUTHORITY', 'Infrastructure Authority'
    ADMINISTRATOR = 'ADMINISTRATOR', 'Administrator'

class User(AbstractBaseUser, PermissionsMixin):
    class Status(models.TextChoices):
        ACTIVE = 'ACTIVE', 'Active'
        INACTIVE = 'INACTIVE', 'Inactive'
        BANNED = 'BANNED', 'Banned'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    email = models.EmailField(unique=True)
    full_name = models.CharField(max_length=255)
    birth_date = models.DateField(null=True, blank=True)
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
    notifications_enabled = models.BooleanField(default=True)
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = ['full_name']

    class Meta:
        db_table = 'users'

    def __str__(self):
        return self.email


class PasswordResetToken(models.Model):
    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name='password_reset_tokens'
    )
    token = models.CharField(max_length=64, unique=True)
    expires_at = models.DateTimeField()
    used = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'password_reset_tokens'

    def __str__(self):
        return f'PasswordResetToken for {self.user.email}'


class MobilityProfile(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='mobility_profile')
    mobility_aid_type = models.CharField(
        max_length=25,
        choices=MobilityAidType.choices,
        default=MobilityAidType.NONE,
    )
    additional_needs = models.TextField(blank=True, default='')
    avoid_stairs = models.BooleanField(default=False)
    avoid_steep_slopes = models.BooleanField(default=False)
    max_slope_gradient = models.FloatField(null=True, blank=True, default=None)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'mobility_profiles'

    def __str__(self):
        return f'{self.user.email} - {self.mobility_aid_type}'
