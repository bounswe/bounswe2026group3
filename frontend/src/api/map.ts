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

export async function fetchObstacles(
  bbox: { north: number; south: number; east: number; west: number },
  includePassive = false,
): Promise<Obstacle[]> {
  const params = new URLSearchParams({
    bbox: `${bbox.west},${bbox.south},${bbox.east},${bbox.north}`,
    includePassive: String(includePassive),
  });
  try {
    const res = await fetch(`${API_BASE}/api/map/obstacles?${params}`, {
      headers: authHeaders(),
    });
    if (!res.ok) return [];
    const data = await res.json().catch(() => ({}));
    return Array.isArray(data) ? data : (data.results ?? []);
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
    return await res.json().catch(() => null);
  } catch {
    return null;
  }
}

export async function searchLocations(q: string): Promise<SearchResult[]> {
  const params = new URLSearchParams({ q });
  try {
    const res = await fetch(`${API_BASE}/api/map/search?${params}`, {
      headers: authHeaders(),
    });
    if (!res.ok) return [];
    const data = await res.json().catch(() => ({}));
    return Array.isArray(data) ? data : (data.results ?? []);
  } catch {
    return [];
  }
}
