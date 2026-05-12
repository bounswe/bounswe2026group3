from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('reports', '0006_merge_0002_comment_0005_report_bbox_index'),
    ]

    operations = [
        migrations.AddField(
            model_name='report',
            name='violations',
            field=models.JSONField(blank=True, default=list),
        ),
    ]
