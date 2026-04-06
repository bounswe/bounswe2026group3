from .models import Report, Photo, ReportStatus, ObstacleCategory


def create_report(reporter, validated_data) -> Report:
    location = validated_data["location"]
    category = validated_data.get("category", ObstacleCategory.OTHER)
    title = dict(ObstacleCategory.choices).get(category, "Obstacle Report")

    report = Report.objects.create(
        reporter=reporter,
        title=title,
        description=validated_data.get("description", ""),
        category=category,
        context=validated_data["context"],
        latitude=location["lat"],
        longitude=location["lng"],
        status=ReportStatus.UNVERIFIED,
    )

    save_photos(report, validated_data.get("photos", []))

    return report


def save_photos(report: Report, photos: list[str]) -> list[Photo]:
    return Photo.objects.bulk_create([
        Photo(report=report, image_url=url) for url in photos
    ])


def detect_duplicate(report: Report) -> Report | None:
    """Return a similar existing report if found, else None."""
    pass


def auto_verify(report: Report) -> bool:
    """Return True if report meets auto-verification criteria."""
    pass
