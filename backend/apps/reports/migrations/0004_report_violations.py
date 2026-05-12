from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('reports', '0003_report_severity_alter_report_category'),
        ('reports', '0002_comment'),
    ]

    operations = [
        migrations.AddField(
            model_name='report',
            name='violations',
            field=models.JSONField(blank=True, default=list),
        ),
    ]
