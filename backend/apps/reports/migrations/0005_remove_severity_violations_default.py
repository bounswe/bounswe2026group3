from django.db import migrations


class Migration(migrations.Migration):
    """Unblock report creation by realigning the DB with the model.

    - ``severity`` was added by 0003 but later removed from the model with no
      removal migration, leaving a NOT-NULL column with no DB default. Every
      INSERT failed with an IntegrityError. Drop the column to match the model.
    - ``violations`` (added in 0004) needs a DB-level DEFAULT so older deploys
      that don't yet know about the column can still INSERT successfully.
    - Bring Photo's Meta options in line with the model.
    """

    dependencies = [
        ('reports', '0004_report_violations'),
    ]

    operations = [
        migrations.AlterModelOptions(
            name='photo',
            options={'ordering': ['uploaded_at']},
        ),
        migrations.RemoveField(
            model_name='report',
            name='severity',
        ),
        migrations.RunSQL(
            sql="ALTER TABLE reports ALTER COLUMN violations SET DEFAULT '[]'::jsonb;",
            reverse_sql="ALTER TABLE reports ALTER COLUMN violations DROP DEFAULT;",
        ),
    ]
