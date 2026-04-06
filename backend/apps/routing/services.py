import math

import requests

from apps.reports.models import Report

EARTH_RADIUS_M = 6_371_000
OBSTACLE_PROXIMITY_RADIUS_M = 30.0
OSRM_BASE = 'https://router.project-osrm.org'


def haversine(lat1, lng1, lat2, lng2):
    """Return distance in meters between two lat/lng points."""
    lat1, lng1, lat2, lng2 = map(math.radians, [lat1, lng1, lat2, lng2])
    dlat = lat2 - lat1
    dlng = lng2 - lng1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    return EARTH_RADIUS_M * 2 * math.asin(math.sqrt(a))


def fetch_osrm_route(origin_lat, origin_lng, dest_lat, dest_lng):
    """
    Call OSRM public API for pedestrian routing.
    Returns (waypoints, distance_meters, duration_seconds) or raises ValueError.
    """
    url = (
        f'{OSRM_BASE}/route/v1/foot/'
        f'{origin_lng},{origin_lat};{dest_lng},{dest_lat}'
        f'?overview=full&geometries=geojson'
    )

    resp = requests.get(url, timeout=10)

    if resp.status_code != 200:
        raise ValueError('Routing service unavailable. Please try again later.')

    data = resp.json()

    if data.get('code') != 'Ok' or not data.get('routes'):
        raise ValueError('No route found between the given points.')

    route = data['routes'][0]
    coords = route['geometry']['coordinates']  # [[lng, lat], ...]
    waypoints = [[c[1], c[0]] for c in coords]  # convert to [lat, lng]
    distance = route['distance']  # meters
    duration = route['duration']  # seconds

    return waypoints, distance, duration


def get_nearby_obstacles(waypoints, radius_m=OBSTACLE_PROXIMITY_RADIUS_M):
    """Return VERIFIED outdoor obstacles near the route waypoints."""
    obstacles = list(
        Report.objects.filter(
            status='VERIFIED',
            context='OUTDOOR',
        ).values('id', 'latitude', 'longitude', 'title', 'category')
    )

    nearby = []
    seen_ids = set()
    for obs in obstacles:
        obs_lat = float(obs['latitude'])
        obs_lng = float(obs['longitude'])
        for wp in waypoints:
            if haversine(wp[0], wp[1], obs_lat, obs_lng) <= radius_m:
                if obs['id'] not in seen_ids:
                    nearby.append(obs)
                    seen_ids.add(obs['id'])
                break

    return nearby


def get_nearby_unverified(waypoints, radius_m=OBSTACLE_PROXIMITY_RADIUS_M * 2):
    """Return UNVERIFIED outdoor obstacles near the route for warnings."""
    obstacles = list(
        Report.objects.filter(
            status='UNVERIFIED',
            context='OUTDOOR',
        ).values('id', 'latitude', 'longitude', 'title')
    )

    warnings = []
    seen_ids = set()
    for obs in obstacles:
        obs_lat = float(obs['latitude'])
        obs_lng = float(obs['longitude'])
        for wp in waypoints:
            if haversine(wp[0], wp[1], obs_lat, obs_lng) <= radius_m:
                if obs['id'] not in seen_ids:
                    warnings.append(f"Unverified obstacle nearby: {obs['title']}")
                    seen_ids.add(obs['id'])
                break

    return warnings


def calculate_route(origin_lat, origin_lng, dest_lat, dest_lng, preferences):
    """
    Main route calculation using OSRM for real road geometry.
    Returns dict matching frontend RouteResult interface.
    """
    waypoints, distance, duration = fetch_osrm_route(
        origin_lat, origin_lng, dest_lat, dest_lng
    )

    nearby_obstacles = get_nearby_obstacles(waypoints)
    warnings = get_nearby_unverified(waypoints)

    for obs in nearby_obstacles:
        warnings.append(f"Verified obstacle on route: {obs['title']} ({obs['category']})")

    return {
        'waypoints': waypoints,
        'distanceMeters': round(distance, 1),
        'estimatedTimeSeconds': round(duration),
        'avoidedObstaclesCount': len(nearby_obstacles),
        'warnings': warnings,
        'isAccessible': len(nearby_obstacles) == 0,
    }
