import { API_BASE } from '../constants/theme';
import { getAccessToken } from '../services/auth';

export interface SavedPlace {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  address?: string;
  createdAt: string;
}

export interface SavedPlacePayload {
  label: string;
  latitude: number;
  longitude: number;
  address?: string;
}

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getAccessToken();
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

export async function getSavedPlaces(): Promise<SavedPlace[]> {
  try {
    const res = await fetch(`${API_BASE}/api/users/me/saved-places/`, {
      headers: authHeaders(),
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function createSavedPlace(payload: SavedPlacePayload): Promise<SavedPlace | null> {
  try {
    const res = await fetch(`${API_BASE}/api/users/me/saved-places/`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function deleteSavedPlace(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/users/me/saved-places/${id}/`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    return res.ok || res.status === 204;
  } catch {
    return false;
  }
}
