import math

import requests

from apps.reports.models import Report

EARTH_RADIUS_M = 6_371_000
OBSTACLE_PROXIMITY_RADIUS_M = 40.0
# Padding added around the origin-destination bounding box when pre-filtering
# obstacles for Valhalla.  ~1 km at Istanbul's latitude (1° ≈ 111 km).
ROUTE_OBSTACLE_PADDING_DEG = 0.009
UNVERIFIED_WARNING_RADIUS_M = 80.0
VALHALLA_BASE = 'https://valhalla1.openstreetmap.de'
WALKING_SPEED_MS = 4000 / 3600  # 4 km/h in m/s


def haversine(lat1, lng1, lat2, lng2):
    lat1, lng1, lat2, lng2 = map(math.radians, [lat1, lng1, lat2, lng2])
    dlat = lat2 - lat1
    dlng = lng2 - lng1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    return EARTH_RADIUS_M * 2 * math.asin(math.sqrt(a))


_M_PER_DEG = math.pi * EARTH_RADIUS_M / 180.0


def _point_to_segment_distance_m(p_lat, p_lng, a_lat, a_lng, b_lat, b_lng):
    """Distance in meters from point P to segment AB using a local
    equirectangular projection around A. Accurate for short segments (<~few km)."""
    cos_lat = math.cos(math.radians(a_lat))
    dx_p = (p_lng - a_lng) * cos_lat
    dy_p = (p_lat - a_lat)
    dx_b = (b_lng - a_lng) * cos_lat
    dy_b = (b_lat - a_lat)

    seg_sq = dx_b * dx_b + dy_b * dy_b
    if seg_sq == 0:
        # Zero-length segment — fall back to point-to-point.
        return math.hypot(dx_p, dy_p) * _M_PER_DEG

    t = (dx_p * dx_b + dy_p * dy_b) / seg_sq
    t = max(0.0, min(1.0, t))
    cx = t * dx_b
    cy = t * dy_b
    return math.hypot(dx_p - cx, dy_p - cy) * _M_PER_DEG


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


def _get_verified_obstacles(bbox=None):
    qs = Report.objects.filter(status='VERIFIED', context='OUTDOOR')
    if bbox:
        qs = qs.filter(
            latitude__gte=bbox['south'], latitude__lte=bbox['north'],
            longitude__gte=bbox['west'], longitude__lte=bbox['east'],
        )
    return list(qs.values('id', 'latitude', 'longitude', 'title', 'category'))


def _get_unverified_obstacles():
    return list(
        Report.objects.filter(status='UNVERIFIED', context='OUTDOOR')
        .values('id', 'latitude', 'longitude', 'title')
    )


def _obstacles_on_route(waypoints, obstacles, radius_m):
    """Return obstacles within radius_m of the route polyline (any segment between
    consecutive waypoints). Each obstacle returned once."""
    if not waypoints:
        return []
    nearby = []
    seen = set()
    for obs in obstacles:
        if obs['id'] in seen:
            continue
        obs_lat, obs_lng = float(obs['latitude']), float(obs['longitude'])
        if len(waypoints) == 1:
            wp = waypoints[0]
            if haversine(wp[0], wp[1], obs_lat, obs_lng) <= radius_m:
                nearby.append(obs)
                seen.add(obs['id'])
            continue
        for i in range(len(waypoints) - 1):
            a, b = waypoints[i], waypoints[i + 1]
            if _point_to_segment_distance_m(
                obs_lat, obs_lng, a[0], a[1], b[0], b[1]
            ) <= radius_m:
                nearby.append(obs)
                seen.add(obs['id'])
                break
    return nearby


def _call_valhalla(origin, destination, exclude_locations=None):
    """
    Call Valhalla pedestrian routing API.
    exclude_locations: list of obstacle dicts with 'latitude'/'longitude'.
    Each obstacle is passed as a small exclude_polygon (~50 m square) so
    Valhalla avoids the road *segment* around the obstacle, not just the
    nearest intersection (which exclude_locations snaps to).
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
        r = 0.00045  # ~50 m at mid-latitudes
        body['exclude_polygons'] = [
            [
                [float(loc['longitude']) - r, float(loc['latitude']) - r],
                [float(loc['longitude']) + r, float(loc['latitude']) - r],
                [float(loc['longitude']) + r, float(loc['latitude']) + r],
                [float(loc['longitude']) - r, float(loc['latitude']) + r],
                [float(loc['longitude']) - r, float(loc['latitude']) - r],
            ]
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
      2. if on_baseline is non-empty, avoidance route with ALL verified obstacles
         passed to Valhalla as exclude_locations (not just on_baseline) so the
         alternative doesn't end up routing through a different verified obstacle
         that simply wasn't on the original baseline.

    avoidedObstaclesCount = |on_baseline_ids - on_chosen_ids|  (set diff). This
    counts only the baseline-blocking obstacles we actually got rid of, and isn't
    confused by new obstacles the alternative happens to pass near.

    Returns baselineRoute always, and alternativeRoute only when it strictly
    improves on the baseline (avoidedObstaclesCount > 0).
    Warnings and isAccessible are derived from all verified obstacles on the
    chosen route.
    """
    origin = [origin_lat, origin_lng]
    destination = [dest_lat, dest_lng]

    # 1) Baseline: shortest route, no exclusions.
    baseline_waypoints, baseline_distance, baseline_duration = _call_valhalla(origin, destination)

    # Build bbox from actual baseline waypoints so obstacles that lie on the
    # real route (but outside the direct origin-destination box) are captured.
    pad = ROUTE_OBSTACLE_PADDING_DEG
    lats = [wp[0] for wp in baseline_waypoints]
    lngs = [wp[1] for wp in baseline_waypoints]
    route_bbox = {
        'south': min(lats) - pad,
        'north': max(lats) + pad,
        'west': min(lngs) - pad,
        'east': max(lngs) + pad,
    }
    verified_obstacles = _get_verified_obstacles(bbox=route_bbox)
    unverified = _get_unverified_obstacles()

    on_baseline = _obstacles_on_route(
        baseline_waypoints, verified_obstacles, OBSTACLE_PROXIMITY_RADIUS_M
    )
    on_baseline_ids = {obs['id'] for obs in on_baseline}

    baseline_route = _route_payload(baseline_waypoints, baseline_distance, baseline_duration)
    alternative_route = None
    chosen_waypoints = baseline_waypoints
    on_chosen = on_baseline

    # 2) If any verified obstacles exist in the route area, always call Valhalla
    #    with them as exclusions and use that as the chosen route. The old
    #    on_baseline gate caused avoidance to be silently discarded whenever
    #    the obstacle wasn't within 40 m of a baseline waypoint.
    if verified_obstacles:
        try:
            alt_waypoints, alt_distance, alt_duration = _call_valhalla(
                origin, destination, exclude_locations=verified_obstacles,
            )
            on_alternative = _obstacles_on_route(
                alt_waypoints, verified_obstacles, OBSTACLE_PROXIMITY_RADIUS_M
            )
            alternative_route = _route_payload(alt_waypoints, alt_distance, alt_duration)
            chosen_waypoints = alt_waypoints
            on_chosen = on_alternative
        except ValueError:
            # Avoidance failed — stick with baseline.
            pass

    on_chosen_ids = {obs['id'] for obs in on_chosen}
    avoided_count = len(on_baseline_ids - on_chosen_ids)

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
