import { API_BASE } from '../constants/theme';
import { getAccessToken } from '../services/auth';

export interface Notification {
  id: string;
  message: string;
  reportId: string;
  isRead: boolean;
  createdAt: string;
}

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getAccessToken();
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

export async function getNotifications(): Promise<Notification[]> {
  try {
    const res = await fetch(`${API_BASE}/api/notifications/`, {
      headers: authHeaders(),
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function markNotificationRead(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/api/notifications/${id}/read/`, {
      method: 'PATCH',
      headers: authHeaders(),
    });
    return res.ok;
  } catch {
    return false;
  }
}
