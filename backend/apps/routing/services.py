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


def _route_payload(waypoints, distance, duration):
    return {
        'waypoints': waypoints,
        'distanceMeters': round(distance, 1),
        'estimatedTimeSeconds': round(duration),
    }


def calculate_route(origin_lat, origin_lng, dest_lat, dest_lng, preferences):
    """
    Pedestrian route using Valhalla, computed in two passes:
      1. baseline route with no exclusions → obstacles that lie on it (on_baseline)
      2. if on_baseline is non-empty, avoidance route excluding only those obstacles
         → obstacles still on it (on_avoidance)
    avoidedObstaclesCount = len(on_baseline) - len(on_avoidance), so it only counts
    obstacles relevant to *this* trip.

    Returns baselineRoute always, and alternativeRoute only when the second pass
    actually improves on the baseline (fewer obstacles on the path).
    Warnings and isAccessible are derived from the chosen route.
    """
    origin = [origin_lat, origin_lng]
    destination = [dest_lat, dest_lng]

    verified_obstacles = _get_verified_obstacles()
    unverified = _get_unverified_obstacles()

    # 1) Baseline: shortest route, no exclusions.
    baseline_waypoints, baseline_distance, baseline_duration = _call_valhalla(origin, destination)
    on_baseline = _obstacles_on_route(
        baseline_waypoints, verified_obstacles, OBSTACLE_PROXIMITY_RADIUS_M
    )

    baseline_route = _route_payload(baseline_waypoints, baseline_distance, baseline_duration)
    alternative_route = None
    chosen_waypoints = baseline_waypoints
    on_chosen = on_baseline

    # 2) Try avoidance only if the baseline actually hits obstacles.
    if on_baseline:
        try:
            alt_waypoints, alt_distance, alt_duration = _call_valhalla(
                origin, destination, exclude_locations=on_baseline,
            )
            on_avoidance = _obstacles_on_route(
                alt_waypoints, verified_obstacles, OBSTACLE_PROXIMITY_RADIUS_M
            )
            # Only surface the alternative if it genuinely improves on baseline.
            if len(on_avoidance) < len(on_baseline):
                alternative_route = _route_payload(alt_waypoints, alt_distance, alt_duration)
                chosen_waypoints = alt_waypoints
                on_chosen = on_avoidance
        except ValueError:
            # Avoidance failed — stick with baseline.
            pass

    avoided_count = len(on_baseline) - len(on_chosen)

    warnings = [
        f"Verified obstacle on route: {obs['title']} ({obs['category']})"
        for obs in on_chosen
    ]
    for obs in _obstacles_on_route(chosen_waypoints, unverified, UNVERIFIED_WARNING_RADIUS_M):
        warnings.append(f"Unverified obstacle nearby: {obs['title']}")

    chosen_route = alternative_route or baseline_route
    return {
        # Backward-compat: top-level mirrors the chosen route.
        'waypoints': chosen_route['waypoints'],
        'distanceMeters': chosen_route['distanceMeters'],
        'estimatedTimeSeconds': chosen_route['estimatedTimeSeconds'],
        # New per-trip routes.
        'baselineRoute': baseline_route,
        'alternativeRoute': alternative_route,
        'avoidedObstaclesCount': avoided_count,
        'warnings': warnings,
        'isAccessible': len(on_chosen) == 0,
    }
