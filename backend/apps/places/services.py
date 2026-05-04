from .models import SavedPlace


class SavedPlaceNotFoundError(Exception):
    """Raised when a saved place is missing or owned by another user."""


def list_saved_places(user):
    return SavedPlace.objects.filter(user=user)


def create_saved_place(user, *, label, latitude, longitude, address='') -> SavedPlace:
    return SavedPlace.objects.create(
        user=user,
        label=label,
        latitude=latitude,
        longitude=longitude,
        address=address,
    )


def delete_saved_place(user, place_id) -> None:
    deleted, _ = SavedPlace.objects.filter(pk=place_id, user=user).delete()
    if deleted == 0:
        raise SavedPlaceNotFoundError()
