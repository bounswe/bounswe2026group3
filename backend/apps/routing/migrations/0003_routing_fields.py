from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("routing", "0002_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="campusedge",
            name="is_stairs",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="route",
            name="polyline",
            field=models.TextField(blank=True, default=""),
        ),
        migrations.AddField(
            model_name="route",
            name="avoided_obstacles",
            field=models.JSONField(blank=True, default=list),
        ),
        migrations.AddField(
            model_name="route",
            name="warnings",
            field=models.JSONField(blank=True, default=list),
        ),
    ]
