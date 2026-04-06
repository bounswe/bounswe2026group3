from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("reports", "0002_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="report",
            name="is_indoor",
            field=models.BooleanField(default=False),
        ),
    ]
