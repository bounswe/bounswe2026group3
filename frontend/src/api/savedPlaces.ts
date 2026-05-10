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

export type CreateSavedPlaceResult =
  | { ok: true; data: SavedPlace }
  | { ok: false; error: string };

export async function createSavedPlace(
  payload: SavedPlacePayload,
): Promise<CreateSavedPlaceResult> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/users/me/saved-places/`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
  } catch {
    return { ok: false, error: 'Network error. Check your connection.' };
  }

  const body = await res.json().catch(() => null);

  if (res.ok) {
    return { ok: true, data: body as SavedPlace };
  }

  // Backend wraps validation errors as { error: { code, detail, timestamp } }
  // (apps/core/exceptions.custom_exception_handler). Fall back to detail or
  // a generic message when the shape doesn't match.
  const error =
    (body && typeof body === 'object' && body.error?.detail) ||
    (body && typeof body === 'object' && body.detail) ||
    'Failed to save place. Please try again.';
  return { ok: false, error: String(error) };
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
