import uuid

from django.conf import settings
from django.db import models


class SavedPlace(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='saved_places',
    )
    label = models.CharField(max_length=50)
    # 12 / 8 keeps lat (-90..90) and lng (-180..180) with 8-decimal precision —
    # matches what expo-location and browser geolocation actually emit.
    latitude = models.DecimalField(max_digits=12, decimal_places=8)
    longitude = models.DecimalField(max_digits=12, decimal_places=8)
    address = models.CharField(max_length=255, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'saved_places'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.user.email} - {self.label}'
