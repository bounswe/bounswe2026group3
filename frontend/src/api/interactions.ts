import { API_BASE } from '../constants/theme';
import { getAccessToken } from '../services/auth';

function authHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${getAccessToken()}`,
  };
}

export async function postUpvote(
  reportId: string,
): Promise<{ ok: boolean; data: { upvoteCount: number; userUpvoted: boolean } }> {
  try {
    const res = await fetch(`${API_BASE}/api/reports/${reportId}/upvote/`, {
      method: 'POST',
      headers: authHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  } catch {
    return { ok: false, data: { upvoteCount: 0, userUpvoted: false } };
  }
}

export async function postFlag(
  reportId: string,
): Promise<{ ok: boolean; data: { flagCount: number; userFlagged: boolean } }> {
  try {
    const res = await fetch(`${API_BASE}/api/reports/${reportId}/flag/`, {
      method: 'POST',
      headers: authHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  } catch {
    return { ok: false, data: { flagCount: 0, userFlagged: false } };
  }
}

export async function confirmResolution(
  reportId: string,
): Promise<{ ok: boolean; data: { status: string } }> {
  try {
    const res = await fetch(`${API_BASE}/api/reports/${reportId}/confirm-resolution/`, {
      method: 'POST',
      headers: authHeaders(),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  } catch {
    return { ok: false, data: { status: '' } };
  }
}
