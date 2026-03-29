from django.contrib.auth.models import AbstractBaseUser, BaseUserManager, PermissionsMixin
from django.db import models


class UserManager(BaseUserManager):

    def create_user(self, email, password=None, **extra_fields):
        if not email:
            raise ValueError('Email is mandatory.')
        email = self.normalize_email(email)
        user = self.model(email=email, **extra_fields)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password=None, **extra_fields):
        extra_fields['is_staff'] = True
        extra_fields['is_superuser'] = True
        return self.create_user(email, password, **extra_fields)

# Authorization
# No Guest User since it is not supposed to be in database
class UserRole(models.TextChoices):
    REGISTERED_USER = 'REGISTERED_USER', 'Registered User'
    INFRASTRUCTURE_AUTHORITY = 'INFRASTRUCTURE_AUTHORITY', 'Infrastructure Authority'
    ADMINISTRATOR = 'ADMINISTRATOR', 'Administrator'

class User(AbstractBaseUser, PermissionsMixin):


    role = models.CharField(
        max_length=30,
        choices=UserRole.choices,
        default=UserRole.REGISTERED_USER,
    )

    # User creation
    email = models.EmailField(unique=True)
    full_name = models.CharField(max_length=255, blank=True, default='')
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)

    objects = UserManager()

    USERNAME_FIELD = 'email'
    REQUIRED_FIELDS = []

    def __str__(self):
        return self.email