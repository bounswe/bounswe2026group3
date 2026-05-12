import { API_BASE } from '../constants/theme';
import { getAccessToken } from '../services/auth';

export interface Obstacle {
  id: string;
  title: string;
  description: string;
  category: 'BROKEN_RAMP' | 'NARROW_SIDEWALK' | 'DAMAGED_SURFACE' | 'ROAD_CONSTRUCTION' | 'BLOCKED_PATH' | 'OTHER';
  status: 'UNVERIFIED' | 'PASSIVE' | 'VERIFIED' | 'RESOLVED_AWAITING_VALIDATION' | 'CLOSED';
  latitude: number;
  longitude: number;
  isIndoor?: boolean;
}

export interface PhotoItem {
  imageUrl: string;
  uploadedAt?: string;
}

export interface StatusChange {
  oldStatus: string;
  newStatus: string;
  changedBy: string;
  reason: string;
  changedAt: string;
}

export interface ObstacleDetail extends Obstacle {
  photos: PhotoItem[];
  upvoteCount: number;
  upvoteThreshold: number;
  flagCount: number;
  confirmationCount: number;
  confirmationThreshold: number;
  userUpvoted: boolean;
  userFlagged: boolean;
  userConfirmed: boolean;
  violations: string[];
  reporterId: string;
  createdAt: string;
  statusHistory: StatusChange[];
}

export interface SearchResult {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

function authHeaders(): Record<string, string> {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const CATEGORY_LABEL: Record<string, string> = {
  BROKEN_RAMP: 'Broken Ramp',
  NARROW_SIDEWALK: 'Narrow Sidewalk',
  DAMAGED_SURFACE: 'Damaged Surface',
  ROAD_CONSTRUCTION: 'Road Construction',
  BLOCKED_PATH: 'Blocked Path',
  BROKEN_ELEVATOR: 'Broken Elevator',
  INACCESSIBLE_RESTROOM: 'Inaccessible Restroom',
  NARROW_CORRIDOR: 'Narrow Corridor',
  HEAVY_DOOR: 'Heavy Door',
  SLIPPERY_FLOOR: 'Slippery Floor',
  OTHER: 'Other',
};

export const HIDDEN_OBSTACLE_STATUSES: ReadonlyArray<Obstacle['status']> = ['CLOSED'];

export function filterVisibleObstacles(obstacles: Obstacle[]): Obstacle[] {
  return obstacles.filter((o) => !HIDDEN_OBSTACLE_STATUSES.includes(o.status));
}

function mapObstacle(raw: any): Obstacle {
  return {
    id: raw.reportId ?? raw.id,
    title: raw.title ?? CATEGORY_LABEL[raw.category] ?? raw.category?.replace(/_/g, ' ') ?? '',
    description: raw.description ?? '',
    category: raw.category,
    status: raw.status,
    latitude: raw.location?.lat ?? raw.latitude,
    longitude: raw.location?.lng ?? raw.longitude,
    isIndoor: raw.isIndoor ?? raw.context === 'INDOOR',
  };
}

export async function fetchObstacles(
  bbox: { north: number; south: number; east: number; west: number },
  includePassive = false,
): Promise<Obstacle[]> {
  const params = new URLSearchParams({
    bbox: `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`,
    includePassive: String(includePassive),
  });
  try {
    const res = await fetch(`${API_BASE}/api/map/obstacles?${params}`, {
      headers: authHeaders(),
    });
    if (!res.ok) return [];
    const data = await res.json().catch(() => ({}));
    const list = Array.isArray(data) ? data : (data.obstacles ?? data.results ?? []);
    return filterVisibleObstacles(list.map(mapObstacle));
  } catch {
    return [];
  }
}

export async function fetchObstacleDetail(id: string): Promise<ObstacleDetail | null> {
  try {
    const res = await fetch(`${API_BASE}/api/map/obstacles/${id}`, {
      headers: authHeaders(),
    });
    if (!res.ok) return null;
    const raw = await res.json().catch(() => null);
    if (!raw) return null;
    const base = mapObstacle(raw);
    return {
      ...base,
      photos: (raw.photos ?? []).map((p: any) => ({
        imageUrl: p.url ?? p.imageUrl,
        uploadedAt: p.uploadedAt ?? p.uploaded_at,
      })),
      upvoteCount: raw.upvoteCount ?? 0,
      upvoteThreshold: raw.upvoteThreshold ?? 5,
      flagCount: raw.flagCount ?? 0,
      confirmationCount: raw.confirmationCount ?? 0,
      confirmationThreshold: raw.confirmationThreshold ?? 3,
      userUpvoted: raw.userUpvoted ?? false,
      userFlagged: raw.userFlagged ?? false,
      userConfirmed: raw.userConfirmed ?? false,
      violations: Array.isArray(raw.violations) ? raw.violations : [],
      reporterId: raw.reporterId ?? '',
      createdAt: raw.createdAt ?? '',
      statusHistory: (raw.statusHistory ?? []).map((h: any) => ({
        oldStatus: h.oldStatus ?? '',
        newStatus: h.newStatus ?? '',
        changedBy: h.changedBy ?? '',
        reason: h.reason ?? '',
        changedAt: h.changedAt ?? '',
      })),
    };
  } catch {
    return null;
  }
}

export async function searchNominatim(q: string): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    q,
    format: 'json',
    addressdetails: '1',
    limit: '5',
    'accept-language': 'en',
    viewbox: '29.035,41.074,29.065,41.095',
    bounded: '0',
  });
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?${params}`,
      { headers: { 'User-Agent': 'AccessMap/1.0' } },
    );
    if (!res.ok) return [];
    const data = await res.json().catch(() => []);
    if (!Array.isArray(data)) return [];
    return data.map((r: any) => ({
      id: String(r.place_id ?? ''),
      name: r.display_name ?? '',
      latitude: parseFloat(r.lat),
      longitude: parseFloat(r.lon),
    }));
  } catch {
    return [];
  }
}

export async function searchLocations(q: string): Promise<SearchResult[]> {
  const params = new URLSearchParams({ q });
  try {
    const res = await fetch(`${API_BASE}/api/map/search?${params}`, {
      headers: authHeaders(),
    });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      const list = Array.isArray(data) ? data : (data.results ?? []);
      const results = list.map((r: any) => ({
        id: r.id ?? r.name ?? '',
        name: r.name ?? '',
        latitude: r.location?.lat ?? r.latitude,
        longitude: r.location?.lng ?? r.longitude,
      }));
      if (results.length > 0) return results;
    }
  } catch {}
  // Fallback to Nominatim when backend returns no results or fails
  return searchNominatim(q);
}

async function nominatimReverse(lat: number, lng: number, zoom: string): Promise<any> {
  const params = new URLSearchParams({
    format: 'json',
    lat: String(lat),
    lon: String(lng),
    zoom,
    addressdetails: '1',
    'accept-language': 'en',
  });
  const res = await fetch(
    `https://nominatim.openstreetmap.org/reverse?${params}`,
    { headers: { 'User-Agent': 'AccessMap/1.0' } },
  );
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

// OSM classes that are definitively outdoor / non-building
const OUTDOOR_CLASSES = new Set([
  'highway', 'waterway', 'natural', 'landuse', 'boundary', 'place',
]);

// OSM types that are outdoor structures / memorials even when class = tourism|historic
const OUTDOOR_TYPES = new Set([
  'memorial', 'statue', 'monument', 'ruins', 'wayside_cross', 'wayside_shrine',
  'archaeological_site', 'tree', 'bench', 'waste_basket',
]);

/**
 * Returns the indoor-venue name from a Nominatim reverse-geocode result, or null.
 *
 * INCLUDED (indoor venues the user might report an obstacle in):
 *   amenity=restaurant/pharmacy/cafe/hospital/…, shop=*, office=*, tourism=hotel/hostel,
 *   leisure=gym/…, building polygon with a name, etc.
 *
 * EXCLUDED (outdoor features that would give wrong suggestions):
 *   highways/roads, waterways, memorials, statues, monuments, natural features,
 *   administrative boundaries, etc.
 */
function extractNominatimName(data: any): string | null {
  if (!data?.name) return null;
  const cls: string  = data.class ?? '';
  const type: string = data.type  ?? '';
  if (OUTDOOR_CLASSES.has(cls))  return null;
  if (OUTDOOR_TYPES.has(type))   return null;
  return data.name as string;
}

/**
 * Finds the nearest named building polygon within `radius` metres using
 * the Overpass API.  Queries OSM *ways* (polygons) directly — unaffected by
 * nearby POI nodes that Nominatim might prefer.
 */
async function overpassNearestBuilding(
  lat: number,
  lng: number,
  radius = 35,
): Promise<string | null> {
  const query =
    `[out:json][timeout:6];` +
    `way(around:${radius},${lat},${lng})[building][name];` +
    `out center tags;`;

  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `data=${encodeURIComponent(query)}`,
  });
  if (!res.ok) return null;

  const data = await res.json().catch(() => null);
  if (!Array.isArray(data?.elements) || data.elements.length === 0) return null;

  // Pick the element whose centroid is closest to the pin.
  let best: { name: string; dist: number } | null = null;
  for (const el of data.elements) {
    const name: string | undefined = el.tags?.name;
    if (!name) continue;
    const cLat: number = el.center?.lat ?? lat;
    const cLon: number = el.center?.lon ?? lng;
    const dist = Math.hypot(cLat - lat, cLon - lng);
    if (!best || dist < best.dist) best = { name, dist };
  }

  return best?.name ?? null;
}

/**
 * Returns the building / venue name at the given coordinates, or null.
 *
 * Two-tier strategy with a proximity gate:
 *
 *  Tier 1 — Nominatim (POI precision, proximity-gated)
 *    Nominatim returns the most specific named OSM node near the pin, together
 *    with that node's own coordinates (data.lat/data.lon).
 *    If the returned element is within ~20 m of the pin the user deliberately
 *    tapped on it (e.g. a restaurant or pharmacy icon) → use its name.
 *    If it is farther away, the user clicked somewhere in a building and
 *    Nominatim just found the nearest node in the area → skip it.
 *
 *  Tier 2 — Overpass (building polygon fallback)
 *    When the pin is in an open area of a building (no POI node underneath),
 *    Nominatim returns something far away.  Overpass finds named building
 *    polygons within 35 m and picks the closest centroid.
 *
 *  Tier 3 — Nominatim regardless of distance
 *    No building polygon was found either.  If Nominatim returned any named
 *    indoor venue (not a road / memorial / natural feature) use it as a last
 *    resort (better than nothing).
 *
 * Returns null when no indoor name can be determined → the field stays empty
 * so the user can type manually.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  // ~20 m expressed in degrees (1° lat ≈ 111 km)
  const PROXIMITY_DEG = 0.00018;

  try {
    const [nominatimData, overpassName] = await Promise.all([
      nominatimReverse(lat, lng, '18').catch(() => null),
      overpassNearestBuilding(lat, lng).catch(() => null),
    ]);

    const nominatimName = extractNominatimName(nominatimData);

    // Tier 1: Nominatim result is very close → user tapped that specific POI
    if (nominatimName && nominatimData) {
      const nLat = parseFloat(nominatimData.lat ?? '');
      const nLon = parseFloat(nominatimData.lon ?? '');
      if (!isNaN(nLat) && !isNaN(nLon)) {
        const dist = Math.hypot(nLat - lat, nLon - lng);
        if (dist < PROXIMITY_DEG) return nominatimName;
      }
    }

    // Tier 2: nearest named building polygon (pin in open building area)
    if (overpassName) return overpassName;

    // Tier 3: Nominatim fallback regardless of distance
    if (nominatimName) return nominatimName;

    return null;
  } catch {
    return null;
  }
}

