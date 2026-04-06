from django.core.management.base import BaseCommand

from apps.map.models import CampusLocation

# Boğaziçi campus bounds (approximate)
# SW: 41.0780, 29.0380  NE: 41.0900, 29.0560

LOCATIONS = [
    # South Campus Buildings
    {
        "name": "South Campus Main Building (BM)",
        "aliases": "Ana Bina,BM,Bina-i Mektep",
        "lat": 41.0837,
        "lng": 29.0510,
        "category": "building",
    },
    {
        "name": "Faculty of Engineering (ETA)",
        "aliases": "Mühendislik Fakültesi,ETA,Mühendislik",
        "lat": 41.0842,
        "lng": 29.0498,
        "category": "building",
    },
    {
        "name": "Albert Long Hall",
        "aliases": "ALH,Albert Long,Konferans Salonu",
        "lat": 41.0835,
        "lng": 29.0505,
        "category": "building",
    },
    {
        "name": "Demir Demirgil Building",
        "aliases": "DD,Demir Demirgil",
        "lat": 41.0840,
        "lng": 29.0515,
        "category": "building",
    },
    {
        "name": "Natuk Birkan Building",
        "aliases": "NB,Natuk Birkan",
        "lat": 41.0833,
        "lng": 29.0520,
        "category": "building",
    },
    {
        "name": "Science and Letters Faculty (FEF)",
        "aliases": "Fen Edebiyat Fakültesi,FEF,Fen Edebiyat",
        "lat": 41.0845,
        "lng": 29.0505,
        "category": "building",
    },
    {
        "name": "South Campus Library",
        "aliases": "Kütüphane,Library,Güney Kampüs Kütüphanesi",
        "lat": 41.0838,
        "lng": 29.0512,
        "category": "library",
    },
    {
        "name": "Student Center (South Campus)",
        "aliases": "Öğrenci Merkezi,Güney Kampüs Öğrenci Merkezi,Kantin",
        "lat": 41.0830,
        "lng": 29.0508,
        "category": "cafeteria",
    },
    # North Campus Buildings
    {
        "name": "Computer Engineering Building",
        "aliases": "BIM,Bilgisayar Mühendisliği,Bilgisayar",
        "lat": 41.0865,
        "lng": 29.0445,
        "category": "building",
    },
    {
        "name": "Electrical Engineering Building",
        "aliases": "EE,Elektrik Mühendisliği,Elektrik Elektronik",
        "lat": 41.0862,
        "lng": 29.0452,
        "category": "building",
    },
    {
        "name": "Science and Technology Center (BTC)",
        "aliases": "BTC,Bilim Teknoloji Merkezi",
        "lat": 41.0868,
        "lng": 29.0440,
        "category": "building",
    },
    {
        "name": "North Campus Cafeteria",
        "aliases": "Kuzey Kampüs Yemekhane,Yemekhane,Kafeterya",
        "lat": 41.0860,
        "lng": 29.0448,
        "category": "cafeteria",
    },
    {
        "name": "Civil Engineering Building",
        "aliases": "İnşaat Mühendisliği,İnşaat",
        "lat": 41.0870,
        "lng": 29.0455,
        "category": "building",
    },
    {
        "name": "Mechanical Engineering Building",
        "aliases": "Makine Mühendisliği,Makine",
        "lat": 41.0867,
        "lng": 29.0460,
        "category": "building",
    },
    # Gates
    {
        "name": "South Campus Main Gate",
        "aliases": "Güney Kapı,Ana Kapı,Güney Kampüs Girişi",
        "lat": 41.0825,
        "lng": 29.0510,
        "category": "gate",
    },
    {
        "name": "North Campus Main Gate",
        "aliases": "Kuzey Kapı,Kuzey Kampüs Girişi",
        "lat": 41.0855,
        "lng": 29.0435,
        "category": "gate",
    },
    {
        "name": "Bebek Gate",
        "aliases": "Bebek Kapısı,Bebek Girişi",
        "lat": 41.0850,
        "lng": 29.0480,
        "category": "gate",
    },
    # Landmarks / Facilities
    {
        "name": "Boğaziçi University Swimming Pool",
        "aliases": "Havuz,Yüzme Havuzu,Pool",
        "lat": 41.0832,
        "lng": 29.0502,
        "category": "sports",
    },
    {
        "name": "Kennedy Lodge",
        "aliases": "Kennedy Lojmanları,Kennedy",
        "lat": 41.0828,
        "lng": 29.0495,
        "category": "building",
    },
    {
        "name": "Superdorm",
        "aliases": "Süper Yurt,Yurt,Dormitory,Superdorm",
        "lat": 41.0855,
        "lng": 29.0465,
        "category": "dormitory",
    },
]


class Command(BaseCommand):
    help = "Seed the database with Boğaziçi University campus locations for search"

    def handle(self, *args, **options):
        self.stdout.write("Seeding campus locations...")

        created_count = 0
        for loc in LOCATIONS:
            _, created = CampusLocation.objects.get_or_create(
                name=loc["name"],
                defaults={
                    "aliases": loc["aliases"],
                    "latitude": loc["lat"],
                    "longitude": loc["lng"],
                    "category": loc["category"],
                },
            )
            status = "Created" if created else "Already exists"
            self.stdout.write(f"  {status}: {loc['name']}")
            if created:
                created_count += 1

        total = CampusLocation.objects.count()
        self.stdout.write(
            self.style.SUCCESS(f"Done! {total} locations ({created_count} new)")
        )
