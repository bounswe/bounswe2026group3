from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("users", "0002_user_role"),
    ]

    operations = [
        migrations.AddField(
            model_name="mobilityprofile",
            name="avoid_stairs",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="mobilityprofile",
            name="avoid_steep_slopes",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="mobilityprofile",
            name="max_slope_gradient",
            field=models.FloatField(blank=True, default=None, null=True),
        ),
    ]
