from .models import Report, Photo


def create_report(reporter, validated_data) -> Report:
    pass


def save_photos(report: Report, photos: list[str]) -> list[Photo]:
    """Decode base64 photos, persist to storage, return Photo instances."""
    pass


def detect_duplicate(report: Report) -> Report | None:
    """Return a similar existing report if found, else None."""
    pass


def auto_verify(report: Report) -> bool:
    """Return True if report meets auto-verification criteria."""
    pass
