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

export interface ObstacleDetail extends Obstacle {
  photos: PhotoItem[];
  upvoteCount: number;
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
  OTHER: 'Other',
};

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
    return list.map(mapObstacle);
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
