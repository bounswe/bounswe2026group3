import math

import requests

from apps.reports.models import Report

EARTH_RADIUS_M = 6_371_000
OBSTACLE_AVOIDANCE_RADIUS_M = 40.0   # obstacle proximity check radius
DETOUR_OFFSET_M = 60.0                # how far to offset avoidance waypoint
UNVERIFIED_WARNING_RADIUS_M = 80.0
OSRM_BASE = 'https://router.project-osrm.org'


def haversine(lat1, lng1, lat2, lng2):
    lat1, lng1, lat2, lng2 = map(math.radians, [lat1, lng1, lat2, lng2])
    dlat = lat2 - lat1
    dlng = lng2 - lng1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    return EARTH_RADIUS_M * 2 * math.asin(math.sqrt(a))


def _offset_point(lat, lng, bearing_deg, distance_m):
    """Return a new lat/lng offset from the given point by distance_m in bearing_deg direction."""
    bearing = math.radians(bearing_deg)
    lat_r = math.radians(lat)
    lng_r = math.radians(lng)
    d = distance_m / EARTH_RADIUS_M

    new_lat = math.asin(
        math.sin(lat_r) * math.cos(d) +
        math.cos(lat_r) * math.sin(d) * math.cos(bearing)
    )
    new_lng = lng_r + math.atan2(
        math.sin(bearing) * math.sin(d) * math.cos(lat_r),
        math.cos(d) - math.sin(lat_r) * math.sin(new_lat)
    )
    return math.degrees(new_lat), math.degrees(new_lng)


def _segment_bearing(lat1, lng1, lat2, lng2):
    """Return bearing in degrees from point1 to point2."""
    lat1, lat2 = math.radians(lat1), math.radians(lat2)
    dlng = math.radians(lng2 - lng1)
    x = math.sin(dlng) * math.cos(lat2)
    y = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(dlng)
    return (math.degrees(math.atan2(x, y)) + 360) % 360


def _build_osrm_url(waypoints_latlng):
    """Build OSRM route URL from list of [lat, lng] pairs."""
    coords = ';'.join(f'{lng},{lat}' for lat, lng in waypoints_latlng)
    return f'{OSRM_BASE}/route/v1/foot/{coords}?overview=full&geometries=geojson'


def _call_osrm(waypoints_latlng):
    """Call OSRM and return (waypoints, distance_m, duration_s)."""
    url = _build_osrm_url(waypoints_latlng)
    resp = requests.get(url, timeout=10)

    if resp.status_code != 200:
        raise ValueError('Routing service unavailable. Please try again later.')

    data = resp.json()
    if data.get('code') != 'Ok' or not data.get('routes'):
        raise ValueError('No route found between the given points.')

    route = data['routes'][0]
    coords = route['geometry']['coordinates']       # [[lng, lat], ...]
    waypoints = [[c[1], c[0]] for c in coords]      # → [[lat, lng], ...]
    return waypoints, route['distance'], route['duration']


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


def _avoidance_waypoints(waypoints, obstacles, radius_m, offset_m):
    """
    For each obstacle on the route, find the closest waypoint pair (segment),
    compute a perpendicular offset point, and return it as an avoidance waypoint
    along with its insertion index.
    Returns list of (insert_after_index, avoidance_lat, avoidance_lng).
    """
    avoidances = []
    for obs in obstacles:
        obs_lat, obs_lng = float(obs['latitude']), float(obs['longitude'])

        # Find the waypoint closest to this obstacle
        closest_idx = min(
            range(len(waypoints)),
            key=lambda i: haversine(waypoints[i][0], waypoints[i][1], obs_lat, obs_lng)
        )

        # Determine bearing of the route at that point
        if closest_idx < len(waypoints) - 1:
            bearing = _segment_bearing(
                waypoints[closest_idx][0], waypoints[closest_idx][1],
                waypoints[closest_idx + 1][0], waypoints[closest_idx + 1][1],
            )
        else:
            bearing = _segment_bearing(
                waypoints[closest_idx - 1][0], waypoints[closest_idx - 1][1],
                waypoints[closest_idx][0], waypoints[closest_idx][1],
            )

        # Offset perpendicular (90° to the right of travel direction)
        avoid_lat, avoid_lng = _offset_point(obs_lat, obs_lng, (bearing + 90) % 360, offset_m)
        avoidances.append((closest_idx, avoid_lat, avoid_lng))

    return avoidances


def _build_waypoints_with_avoidances(origin, destination, avoidances):
    """
    Build the OSRM waypoint list: origin → avoidance points (sorted by route order) → destination.
    """
    sorted_avoidances = sorted(avoidances, key=lambda x: x[0])
    mid = [[lat, lng] for _, lat, lng in sorted_avoidances]
    return [origin] + mid + [destination]


def calculate_route(origin_lat, origin_lng, dest_lat, dest_lng, preferences):
    """
    Pedestrian route calculation using OSRM.
    - First fetches a direct route.
    - Detects verified obstacles on the route.
    - If any found, inserts avoidance waypoints and re-fetches via OSRM.
    - Warns about unverified obstacles near the final route.
    """
    origin = [origin_lat, origin_lng]
    destination = [dest_lat, dest_lng]

    # Step 1: initial route
    waypoints, distance, duration = _call_osrm([origin, destination])

    verified_obstacles = _get_verified_obstacles()
    on_route = _obstacles_on_route(waypoints, verified_obstacles, OBSTACLE_AVOIDANCE_RADIUS_M)

    # Step 2: reroute around verified obstacles if any
    avoided_count = 0
    if on_route:
        avoidances = _avoidance_waypoints(waypoints, on_route, OBSTACLE_AVOIDANCE_RADIUS_M, DETOUR_OFFSET_M)
        new_osrm_wps = _build_waypoints_with_avoidances(origin, destination, avoidances)

        try:
            waypoints, distance, duration = _call_osrm(new_osrm_wps)
            # Check how many obstacles remain on the new route
            remaining = _obstacles_on_route(waypoints, on_route, OBSTACLE_AVOIDANCE_RADIUS_M)
            avoided_count = len(on_route) - len(remaining)
            on_route = remaining  # obstacles still on route after rerouting
        except ValueError:
            # Rerouting failed — fall back to original route
            on_route = _obstacles_on_route(waypoints, verified_obstacles, OBSTACLE_AVOIDANCE_RADIUS_M)
            avoided_count = 0

    # Step 3: warnings
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
