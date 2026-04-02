from django.core.management.base import BaseCommand

from apps.routing.models import CampusEdge, CampusNode


NODES = [
    # South Campus Buildings
    {"name": "South Campus Main Building (BM)", "node_type": "BUILDING", "lat": 41.0837, "lng": 29.0510, "accessible": True},
    {"name": "Faculty of Engineering (ETA)", "node_type": "BUILDING", "lat": 41.0842, "lng": 29.0498, "accessible": True},
    {"name": "Albert Long Hall (ALH)", "node_type": "BUILDING", "lat": 41.0835, "lng": 29.0505, "accessible": True},
    {"name": "Demir Demirgil Building (DD)", "node_type": "BUILDING", "lat": 41.0840, "lng": 29.0515, "accessible": True},
    {"name": "Natuk Birkan Building (NB)", "node_type": "BUILDING", "lat": 41.0833, "lng": 29.0520, "accessible": True},
    {"name": "Science and Letters Faculty (FEF)", "node_type": "BUILDING", "lat": 41.0845, "lng": 29.0505, "accessible": True},
    {"name": "Library (South)", "node_type": "BUILDING", "lat": 41.0838, "lng": 29.0512, "accessible": True},
    {"name": "Student Center (South)", "node_type": "BUILDING", "lat": 41.0830, "lng": 29.0508, "accessible": True},
    # North Campus Buildings
    {"name": "Computer Engineering Building (BIM)", "node_type": "BUILDING", "lat": 41.0865, "lng": 29.0445, "accessible": True},
    {"name": "Electrical Engineering Building (EE)", "node_type": "BUILDING", "lat": 41.0862, "lng": 29.0452, "accessible": True},
    {"name": "Science and Technology Center (BTC)", "node_type": "BUILDING", "lat": 41.0868, "lng": 29.0440, "accessible": False},
    {"name": "North Campus Cafeteria", "node_type": "BUILDING", "lat": 41.0860, "lng": 29.0448, "accessible": True},
    {"name": "Civil Engineering Building", "node_type": "BUILDING", "lat": 41.0870, "lng": 29.0455, "accessible": True},
    {"name": "Mechanical Engineering Building", "node_type": "BUILDING", "lat": 41.0867, "lng": 29.0460, "accessible": True},
    # Gates
    {"name": "South Campus Main Gate", "node_type": "GATE", "lat": 41.0825, "lng": 29.0510, "accessible": True},
    {"name": "North Campus Main Gate", "node_type": "GATE", "lat": 41.0855, "lng": 29.0435, "accessible": True},
    {"name": "Bebek Gate", "node_type": "GATE", "lat": 41.0850, "lng": 29.0480, "accessible": True},
    # Intersections
    {"name": "South Campus Central Junction", "node_type": "INTERSECTION", "lat": 41.0836, "lng": 29.0510, "accessible": True},
    {"name": "North Campus Central Junction", "node_type": "INTERSECTION", "lat": 41.0863, "lng": 29.0448, "accessible": True},
    {"name": "Inter-Campus Path Junction", "node_type": "INTERSECTION", "lat": 41.0852, "lng": 29.0475, "accessible": True},
    {"name": "Library Crossroad", "node_type": "INTERSECTION", "lat": 41.0839, "lng": 29.0508, "accessible": True},
    {"name": "Engineering Quad Junction", "node_type": "INTERSECTION", "lat": 41.0866, "lng": 29.0450, "accessible": True},
]


EDGES = [
    # South Campus internal paths
    ("South Campus Main Gate", "South Campus Central Junction", 120, True, "concrete", True, 2.0),
    ("South Campus Central Junction", "South Campus Main Building (BM)", 50, True, "concrete", False, 1.0),
    ("South Campus Central Junction", "Library Crossroad", 30, True, "concrete", False, 0.5),
    ("Library Crossroad", "Library (South)", 25, True, "concrete", True, 0.0),
    ("Library Crossroad", "Albert Long Hall (ALH)", 40, True, "stone", False, 3.0),
    ("South Campus Central Junction", "Student Center (South)", 70, True, "concrete", True, 1.5),
    ("South Campus Central Junction", "Demir Demirgil Building (DD)", 60, True, "asphalt", False, 2.0),
    ("Library Crossroad", "Faculty of Engineering (ETA)", 80, True, "asphalt", True, 2.5),
    ("South Campus Central Junction", "Natuk Birkan Building (NB)", 90, True, "concrete", False, 1.0),
    ("Faculty of Engineering (ETA)", "Science and Letters Faculty (FEF)", 45, True, "concrete", False, 1.5),
    # South to North inter-campus path
    ("South Campus Central Junction", "Inter-Campus Path Junction", 200, True, "asphalt", False, 5.0),
    ("Bebek Gate", "Inter-Campus Path Junction", 150, True, "asphalt", True, 3.0),
    ("Inter-Campus Path Junction", "North Campus Central Junction", 180, True, "asphalt", False, 4.0),
    # North Campus internal paths
    ("North Campus Main Gate", "North Campus Central Junction", 100, True, "concrete", True, 1.0),
    ("North Campus Central Junction", "Engineering Quad Junction", 40, True, "concrete", False, 0.5),
    ("Engineering Quad Junction", "Computer Engineering Building (BIM)", 35, True, "concrete", True, 1.0),
    ("Engineering Quad Junction", "Electrical Engineering Building (EE)", 30, True, "concrete", False, 0.5),
    ("North Campus Central Junction", "North Campus Cafeteria", 25, True, "concrete", True, 0.0),
    ("North Campus Central Junction", "Science and Technology Center (BTC)", 55, False, "gravel", False, 8.0),
    ("Engineering Quad Junction", "Civil Engineering Building", 60, True, "asphalt", True, 2.0),
    ("Engineering Quad Junction", "Mechanical Engineering Building", 70, True, "asphalt", False, 3.0),
    ("Civil Engineering Building", "Mechanical Engineering Building", 45, True, "concrete", False, 1.5),
]


class Command(BaseCommand):
    help = "Seed the database with Bogazici University campus graph nodes and edges"

    def handle(self, *args, **options):
        self.stdout.write("Seeding campus graph data...")

        # Create nodes
        node_map = {}
        for node_data in NODES:
            node, created = CampusNode.objects.get_or_create(
                name=node_data["name"],
                defaults={
                    "node_type": node_data["node_type"],
                    "latitude": node_data["lat"],
                    "longitude": node_data["lng"],
                    "is_accessible": node_data["accessible"],
                },
            )
            node_map[node.name] = node
            if created:
                self.stdout.write(f"  Created node: {node.name}")
            else:
                self.stdout.write(f"  Node already exists: {node.name}")

        # Create edges (bidirectional)
        edges_created = 0
        for from_name, to_name, distance, accessible, surface, ramp, slope in EDGES:
            from_node = node_map[from_name]
            to_node = node_map[to_name]

            # Forward edge
            _, created = CampusEdge.objects.get_or_create(
                from_node=from_node,
                to_node=to_node,
                defaults={
                    "distance_meters": distance,
                    "is_accessible": accessible,
                    "surface_type": surface,
                    "has_ramp": ramp,
                    "slope_grade": slope,
                },
            )
            if created:
                edges_created += 1

            # Reverse edge
            _, created = CampusEdge.objects.get_or_create(
                from_node=to_node,
                to_node=from_node,
                defaults={
                    "distance_meters": distance,
                    "is_accessible": accessible,
                    "surface_type": surface,
                    "has_ramp": ramp,
                    "slope_grade": slope,
                },
            )
            if created:
                edges_created += 1

        node_count = CampusNode.objects.count()
        edge_count = CampusEdge.objects.count()
        self.stdout.write(
            self.style.SUCCESS(
                f"Done! {node_count} nodes, {edge_count} edges "
                f"({edges_created} new edges created)"
            )
        )
