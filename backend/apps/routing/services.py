import heapq
import math
import uuid
from collections import defaultdict

from apps.reports.models import Report
from apps.routing.models import CampusEdge, CampusNode

# Average walking speed: ~4.5 km/h = 75 m/min
WALKING_SPEED_M_PER_MIN = 75.0

# Radius in meters to check if an obstacle is near an edge
OBSTACLE_PROXIMITY_RADIUS_M = 15.0

EARTH_RADIUS_M = 6_371_000


def haversine(lat1, lng1, lat2, lng2):
    """Return distance in meters between two lat/lng points."""
    lat1, lng1, lat2, lng2 = map(math.radians, [lat1, lng1, lat2, lng2])
    dlat = lat2 - lat1
    dlng = lng2 - lng1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlng / 2) ** 2
    return EARTH_RADIUS_M * 2 * math.asin(math.sqrt(a))


def encode_polyline(coordinates):
    """Encode a list of (lat, lng) tuples into a Google encoded polyline string."""
    result = []
    prev_lat = 0
    prev_lng = 0

    for lat, lng in coordinates:
        lat_e5 = round(lat * 1e5)
        lng_e5 = round(lng * 1e5)

        d_lat = lat_e5 - prev_lat
        d_lng = lng_e5 - prev_lng

        prev_lat = lat_e5
        prev_lng = lng_e5

        for val in (d_lat, d_lng):
            val = ~(val << 1) if val < 0 else (val << 1)
            while val >= 0x20:
                result.append(chr((0x20 | (val & 0x1F)) + 63))
                val >>= 5
            result.append(chr(val + 63))

    return ''.join(result)


def find_nearest_node(lat, lng):
    """Find the CampusNode closest to the given coordinates."""
    nodes = CampusNode.objects.all()
    best_node = None
    best_dist = float('inf')

    for node in nodes:
        d = haversine(lat, lng, float(node.latitude), float(node.longitude))
        if d < best_dist:
            best_dist = d
            best_node = node

    return best_node


def get_active_obstacles():
    """Return VERIFIED, outdoor (non-INDOOR), non-PASSIVE obstacle reports."""
    return list(
        Report.objects.filter(
            status='VERIFIED',
            is_indoor=False,
        ).values('id', 'latitude', 'longitude')
    )


def get_unverified_obstacles():
    """Return UNVERIFIED outdoor obstacle reports for warnings."""
    return list(
        Report.objects.filter(
            status='UNVERIFIED',
            is_indoor=False,
        ).values('id', 'latitude', 'longitude')
    )


def is_point_near_edge(point_lat, point_lng, from_node, to_node, radius_m=OBSTACLE_PROXIMITY_RADIUS_M):
    """Check if a point is within radius of the edge midpoint."""
    mid_lat = (float(from_node.latitude) + float(to_node.latitude)) / 2
    mid_lng = (float(from_node.longitude) + float(to_node.longitude)) / 2
    dist = haversine(point_lat, point_lng, mid_lat, mid_lng)
    return dist <= radius_m


def build_graph(preferences, obstacles):
    """
    Build adjacency list from CampusEdges, filtering out edges that:
    - are stairs (if avoidStairs=True)
    - exceed maxSlopeGradient (if avoidSteepSlopes=True)
    - are blocked by VERIFIED active obstacles
    Returns (graph dict, node_cache dict, blocked_obstacle_ids set).
    """
    avoid_stairs = preferences.get('avoidStairs', False)
    avoid_steep = preferences.get('avoidSteepSlopes', False)
    max_slope = preferences.get('maxSlopeGradient')

    edges = CampusEdge.objects.select_related('from_node', 'to_node').all()

    node_cache = {}
    graph = defaultdict(list)
    blocked_obstacle_ids = set()

    for edge in edges:
        node_cache[edge.from_node_id] = edge.from_node
        node_cache[edge.to_node_id] = edge.to_node

        # Filter: stairs
        if avoid_stairs and edge.is_stairs:
            continue

        # Filter: steep slopes
        if avoid_steep and max_slope is not None and edge.slope_grade > max_slope:
            continue

        # Filter: blocked by obstacle
        edge_blocked = False
        for obs in obstacles:
            if is_point_near_edge(
                float(obs['latitude']), float(obs['longitude']),
                edge.from_node, edge.to_node,
            ):
                blocked_obstacle_ids.add(str(obs['id']))
                edge_blocked = True
                break

        if edge_blocked:
            continue

        graph[edge.from_node_id].append((edge.to_node_id, edge.distance_meters))

    return graph, node_cache, blocked_obstacle_ids


def dijkstra(graph, start_id, end_id):
    """
    Standard Dijkstra. Returns (path as list of node IDs, total distance).
    Returns (None, None) if no path found.
    """
    dist = {start_id: 0}
    prev = {}
    heap = [(0, start_id)]

    while heap:
        d, u = heapq.heappop(heap)

        if u == end_id:
            path = []
            current = end_id
            while current is not None:
                path.append(current)
                current = prev.get(current)
            return list(reversed(path)), d

        if d > dist.get(u, float('inf')):
            continue

        for v, weight in graph.get(u, []):
            new_dist = d + weight
            if new_dist < dist.get(v, float('inf')):
                dist[v] = new_dist
                prev[v] = u
                heapq.heappush(heap, (new_dist, v))

    return None, None


def calculate_route(origin, destination, preferences):
    """
    Main route calculation.

    origin: dict with 'lat', 'lng'
    destination: dict with 'lat', 'lng'
    preferences: dict with 'avoidStairs', 'avoidSteepSlopes', 'maxSlopeGradient'

    Returns dict with route data or raises ValueError.
    """
    start_node = find_nearest_node(origin['lat'], origin['lng'])
    end_node = find_nearest_node(destination['lat'], destination['lng'])

    if start_node is None or end_node is None:
        raise ValueError('No campus nodes found. Please seed the campus graph.')

    if start_node.id == end_node.id:
        raise ValueError('Origin and destination resolve to the same node.')

    obstacles = get_active_obstacles()
    unverified = get_unverified_obstacles()

    graph, node_cache, avoided_ids = build_graph(preferences, obstacles)

    path, total_distance = dijkstra(graph, start_node.id, end_node.id)

    if path is None:
        raise ValueError(
            'No accessible route found between the given points with current preferences.'
        )

    # Build coordinate list for polyline
    coordinates = []
    for node_id in path:
        node = node_cache.get(node_id)
        if node is None:
            node = CampusNode.objects.get(id=node_id)
        coordinates.append((float(node.latitude), float(node.longitude)))

    # Check for unverified obstacles near the route (generate warnings)
    warnings = []
    for i, (lat, lng) in enumerate(coordinates):
        for obs in unverified:
            dist = haversine(lat, lng, float(obs['latitude']), float(obs['longitude']))
            if dist <= OBSTACLE_PROXIMITY_RADIUS_M * 2:
                warning = f"Unverified obstacle near waypoint {i + 1}"
                if warning not in warnings:
                    warnings.append(warning)

    polyline = encode_polyline(coordinates)

    estimated_minutes = round(total_distance / WALKING_SPEED_M_PER_MIN)
    if estimated_minutes < 1:
        estimated_minutes = 1

    route_id = str(uuid.uuid4())

    return {
        'routeId': route_id,
        'polyline': polyline,
        'totalDistanceMeters': round(total_distance),
        'estimatedTimeMinutes': estimated_minutes,
        'avoidedObstacles': list(avoided_ids),
        'warnings': warnings,
        'waypoints': coordinates,
    }
