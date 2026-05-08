from django.core.management.base import BaseCommand, CommandError

from apps.users.models import User, UserRole


class Command(BaseCommand):
    help = (
        "Set a user's role. Used during development to test the authority "
        "dashboard without a public registration flow for the authority role. "
        "Default role is INFRASTRUCTURE_AUTHORITY."
    )

    def add_arguments(self, parser):
        parser.add_argument('email', help='Email of the user to update.')
        parser.add_argument(
            '--role',
            default=UserRole.INFRASTRUCTURE_AUTHORITY,
            choices=[r.value for r in UserRole],
            help='Target role (default: INFRASTRUCTURE_AUTHORITY).',
        )

    def handle(self, *args, **options):
        email = options['email']
        role = options['role']
        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            raise CommandError(f"No user with email {email!r}.")

        if user.role == role:
            self.stdout.write(f"{email} already has role {role}; nothing to do.")
            return

        previous = user.role
        user.role = role
        user.save(update_fields=['role'])
        self.stdout.write(self.style.SUCCESS(
            f"{email}: {previous} -> {role}"
        ))
