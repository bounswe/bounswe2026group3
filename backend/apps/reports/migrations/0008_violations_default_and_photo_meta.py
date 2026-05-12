from django.db import migrations


class Migration(migrations.Migration):
    """Realign DB with the model after the violations field landed.

    - ``violations`` (added in 0007) needs a DB-level DEFAULT so older deploys
      that don't yet know about the column can still INSERT successfully.
    - Bring Photo's Meta options in line with the model (``ordering`` was
      declared on the model but never recorded in a migration).
    """

    dependencies = [
        ('reports', '0007_report_violations'),
    ]

    operations = [
        migrations.AlterModelOptions(
            name='photo',
            options={'ordering': ['uploaded_at']},
        ),
        migrations.RunSQL(
            sql="ALTER TABLE reports ALTER COLUMN violations SET DEFAULT '[]'::jsonb;",
            reverse_sql="ALTER TABLE reports ALTER COLUMN violations DROP DEFAULT;",
        ),
    ]
