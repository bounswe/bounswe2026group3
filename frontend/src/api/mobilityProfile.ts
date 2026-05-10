import { API_BASE } from '../constants/theme';
import { getAccessToken } from '../services/auth';
import { MobilityProfile, MobilityProfilePayload } from '../types/mobilityProfile';

/**
 * Set MOCK = true while the backend endpoints are not yet implemented.
 * Flip to false once GET/POST/PUT /users/me/mobility-profile are live.
 */
export const MOCK = false;

// ── In-memory mock store ───────────────────────────────────────────────────
let _mockProfile: MobilityProfile | null = null;

/** Exposed only for unit tests — do not call in production code. */
export function __resetMockForTest(): void {
  _mockProfile = null;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function authHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${getAccessToken()}`,
  };
}

function mockDelay(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 400));
}

// ── GET /api/users/me/mobility-profile ─────────────────────────────────────────
export async function getMobilityProfile(): Promise<MobilityProfile | null> {
  if (MOCK) {
    await mockDelay();
    return _mockProfile;
  }
  const res = await fetch(`${API_BASE}/api/users/me/mobility-profile`, {
    headers: authHeaders(),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Failed to load mobility profile');
  return res.json();
}

// ── POST /api/users/me/mobility-profile ────────────────────────────────────────
export async function createMobilityProfile(
  payload: MobilityProfilePayload,
): Promise<MobilityProfile> {
  if (MOCK) {
    await mockDelay();
    _mockProfile = {
      profileId: 'mock-profile-id',
      ...payload,
      createdAt: new Date().toISOString(),
    };
    return _mockProfile;
  }
  const res = await fetch(`${API_BASE}/api/users/me/mobility-profile`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to create mobility profile');
  return res.json();
}

// ── PUT /api/users/me/mobility-profile ─────────────────────────────────────────
export async function updateMobilityProfile(
  payload: MobilityProfilePayload,
): Promise<MobilityProfile> {
  if (MOCK) {
    await mockDelay();
    _mockProfile = { ..._mockProfile!, ...payload };
    return _mockProfile;
  }
  const res = await fetch(`${API_BASE}/api/users/me/mobility-profile`, {
    method: 'PUT',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('Failed to update mobility profile');
  return res.json();
}
