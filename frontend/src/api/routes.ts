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

export interface RouteLeg {
  waypoints: [number, number][];
  distanceMeters: number;
  estimatedTimeSeconds: number;
}

export interface RouteResult {
  // Mirrors the chosen route (alternative if present, else baseline).
  waypoints: [number, number][];
  distanceMeters: number;
  estimatedTimeSeconds: number;
  // Per-trip routes. alternativeRoute is null when avoidance didn't improve on baseline.
  baselineRoute?: RouteLeg;
  alternativeRoute?: RouteLeg | null;
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

function normalizeLeg(raw: any): RouteLeg | undefined {
  if (!raw) return undefined;
  return {
    waypoints: normalizeWaypoints(raw.waypoints ?? []),
    distanceMeters: raw.distanceMeters,
    estimatedTimeSeconds: raw.estimatedTimeSeconds,
  };
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
    return {
      ...data,
      waypoints: normalizeWaypoints(data.waypoints ?? []),
      baselineRoute: normalizeLeg(data.baselineRoute),
      alternativeRoute: data.alternativeRoute ? normalizeLeg(data.alternativeRoute) : null,
    };
  } catch {
    return null;
  }
}
