import math

import requests

from apps.reports.models import Report

EARTH_RADIUS_M = 6_371_000
OBSTACLE_PROXIMITY_RADIUS_M = 40.0
UNVERIFIED_WARNING_RADIUS_M = 80.0
VALHALLA_BASE = 'https://valhalla1.openstreetmap.de'
WALKING_SPEED_MS = 4000 / 3600  # 4 km/h in m/s


def haversine(lat1, lng1, lat2, lng2):
    lat1, lng1, lat2, lng2 = map(math.radians, [lat1, lng1, lat2, lng2])
    dlat = lat2 - lat1
    dlng = lng2 - lng1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    return EARTH_RADIUS_M * 2 * math.asin(math.sqrt(a))


def _decode_polyline(encoded, precision=6):
    """Decode a Valhalla encoded polyline into a list of [lat, lng] pairs."""
    inv = 10 ** -precision
    decoded = []
    previous = [0, 0]
    i = 0
    while i < len(encoded):
        for dim in range(2):
            shift = 0
            result = 0
            while True:
                b = ord(encoded[i]) - 63
                i += 1
                result |= (b & 0x1F) << shift
                shift += 5
                if b < 0x20:
                    break
            if result & 1:
                previous[dim] += ~(result >> 1)
            else:
                previous[dim] += (result >> 1)
        decoded.append([previous[0] * inv, previous[1] * inv])
    return decoded


def _get_verified_obstacles():
    return list(
        Report.objects.filter(status='VERIFIED', context='OUTDOOR')
        .values('id', 'latitude', 'longitude', 'title', 'category')
    )


def _get_unverified_obstacles():
    return list(
        Report.objects.filter(status='UNVERIFIED', context='OUTDOOR')
        .values('id', 'latitude', 'longitude', 'title')
    )


def _obstacles_on_route(waypoints, obstacles, radius_m):
    """Return obstacles within radius_m of any waypoint. Each obstacle returned once."""
    nearby = []
    seen = set()
    for obs in obstacles:
        obs_lat, obs_lng = float(obs['latitude']), float(obs['longitude'])
        for wp in waypoints:
            if haversine(wp[0], wp[1], obs_lat, obs_lng) <= radius_m:
                if obs['id'] not in seen:
                    nearby.append(obs)
                    seen.add(obs['id'])
                break
    return nearby


def _call_valhalla(origin, destination, exclude_locations=None):
    """
    Call Valhalla pedestrian routing API.
    exclude_locations makes Valhalla avoid road segments near those points.
    Returns (waypoints, distance_m, duration_s).
    """
    body = {
        'locations': [
            {'lat': origin[0], 'lon': origin[1]},
            {'lat': destination[0], 'lon': destination[1]},
        ],
        'costing': 'pedestrian',
        'units': 'km',
    }

    if exclude_locations:
        body['exclude_locations'] = [
            {'lat': float(loc['latitude']), 'lon': float(loc['longitude'])}
            for loc in exclude_locations
        ]

    resp = requests.post(f'{VALHALLA_BASE}/route', json=body, timeout=10)

    if resp.status_code != 200:
        try:
            err = resp.json()
            detail = err.get('error', 'Routing service unavailable.')
        except Exception:
            detail = 'Routing service unavailable. Please try again later.'
        raise ValueError(detail)

    data = resp.json()
    trip = data.get('trip', {})
    legs = trip.get('legs', [])
    if not legs:
        raise ValueError('No route found between the given points.')

    shape = legs[0]['shape']
    waypoints = _decode_polyline(shape)
    summary = trip.get('summary', legs[0].get('summary', {}))
    distance_m = summary.get('length', 0) * 1000  # km to meters
    duration_s = summary.get('time') or round(distance_m / WALKING_SPEED_MS)

    return waypoints, distance_m, duration_s


def calculate_route(origin_lat, origin_lng, dest_lat, dest_lng, preferences):
    """
    Pedestrian route using Valhalla.
    - Passes verified obstacles as exclude_locations so Valhalla avoids them.
    - Falls back to direct route if avoidance fails.
    - Warns about unverified obstacles near the final route.
    """
    origin = [origin_lat, origin_lng]
    destination = [dest_lat, dest_lng]

    verified_obstacles = _get_verified_obstacles()

    # Try routing with obstacle avoidance
    avoided_count = 0
    try:
        waypoints, distance, duration = _call_valhalla(
            origin, destination,
            exclude_locations=verified_obstacles if verified_obstacles else None,
        )
    except ValueError:
        # Avoidance route failed — fall back to direct route
        waypoints, distance, duration = _call_valhalla(origin, destination)

    # Check which verified obstacles are still on the final route
    on_route = _obstacles_on_route(waypoints, verified_obstacles, OBSTACLE_PROXIMITY_RADIUS_M)
    avoided_count = len(verified_obstacles) - len(on_route)

    # Build warnings
    warnings = []
    for obs in on_route:
        warnings.append(f"Verified obstacle on route: {obs['title']} ({obs['category']})")

    unverified = _get_unverified_obstacles()
    for obs in _obstacles_on_route(waypoints, unverified, UNVERIFIED_WARNING_RADIUS_M):
        warnings.append(f"Unverified obstacle nearby: {obs['title']}")

    return {
        'waypoints': waypoints,
        'distanceMeters': round(distance, 1),
        'estimatedTimeSeconds': round(duration),
        'avoidedObstaclesCount': avoided_count,
        'warnings': warnings,
        'isAccessible': len(on_route) == 0,
    }
