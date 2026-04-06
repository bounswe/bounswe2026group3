from django.db import models


class CampusLocation(models.Model):
    name = models.CharField(max_length=255)
    aliases = models.TextField(
        blank=True,
        default='',
        help_text='Comma-separated alternative names (Turkish, abbreviations, etc.)',
    )
    latitude = models.DecimalField(max_digits=9, decimal_places=6)
    longitude = models.DecimalField(max_digits=9, decimal_places=6)
    category = models.CharField(max_length=50)

    class Meta:
        db_table = 'campus_locations'

    def __str__(self):
        return self.name
