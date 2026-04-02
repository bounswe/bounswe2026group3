from django.conf import settings
from django.db import models


class NodeType(models.TextChoices):
    BUILDING = 'BUILDING', 'Building'
    INTERSECTION = 'INTERSECTION', 'Intersection'
    GATE = 'GATE', 'Gate'
    OTHER = 'OTHER', 'Other'


class CampusNode(models.Model):
    name = models.CharField(max_length=255)
    node_type = models.CharField(max_length=15, choices=NodeType.choices)
    latitude = models.DecimalField(max_digits=9, decimal_places=6)
    longitude = models.DecimalField(max_digits=9, decimal_places=6)
    is_accessible = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'campus_nodes'

    def __str__(self):
        return self.name


class CampusEdge(models.Model):
    from_node = models.ForeignKey(CampusNode, on_delete=models.CASCADE, related_name='outgoing_edges')
    to_node = models.ForeignKey(CampusNode, on_delete=models.CASCADE, related_name='incoming_edges')
    distance_meters = models.FloatField()
    is_accessible = models.BooleanField(default=True)
    surface_type = models.CharField(max_length=50, default='asphalt')
    has_ramp = models.BooleanField(default=False)
    slope_grade = models.FloatField(default=0.0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'campus_edges'
        unique_together = ('from_node', 'to_node')

    def __str__(self):
        return f'{self.from_node.name} -> {self.to_node.name}'


class Route(models.Model):
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='routes',
    )
    start_latitude = models.DecimalField(max_digits=9, decimal_places=6)
    start_longitude = models.DecimalField(max_digits=9, decimal_places=6)
    end_latitude = models.DecimalField(max_digits=9, decimal_places=6)
    end_longitude = models.DecimalField(max_digits=9, decimal_places=6)
    waypoints = models.JSONField(default=list, blank=True)
    distance_meters = models.FloatField()
    estimated_time_seconds = models.IntegerField()
    is_accessible = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'routes'

    def __str__(self):
        return f'Route {self.id} ({"accessible" if self.is_accessible else "standard"})'
