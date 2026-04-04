import { API_BASE } from '../constants/theme';
import { getAccessToken } from '../services/auth';

export interface GuestPreferences {
  avoidStairs: boolean;
  avoidSteepSlopes: boolean;
  maxSlopeGradient: number;
}

export interface RouteRequest {
  originLat: number;
  originLng: number;
  destinationLat: number;
  destinationLng: number;
  preferences?: GuestPreferences;
}

export interface RouteResult {
  waypoints: [number, number][];
  distanceMeters: number;
  estimatedTimeSeconds: number;
  avoidedObstaclesCount?: number;
  warnings?: string[];
  isAccessible?: boolean;
}

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getAccessToken();
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

function normalizeWaypoints(raw: any[]): [number, number][] {
  return raw.map((wp) => {
    if (Array.isArray(wp)) return [wp[0], wp[1]] as [number, number];
    if (typeof wp === 'object' && 'lat' in wp) return [wp.lat, wp.lng] as [number, number];
    return wp as [number, number];
  });
}

export async function calculateRoute(req: RouteRequest): Promise<RouteResult | null> {
  try {
    const res = await fetch(`${API_BASE}/api/routes/calculate`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(req),
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data) return null;
    return { ...data, waypoints: normalizeWaypoints(data.waypoints ?? []) };
  } catch {
    return null;
  }
}
