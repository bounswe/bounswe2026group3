import { API_BASE } from '../constants/theme';
import { getAccessToken } from '../services/auth';

export interface CommentAuthor {
  userId: string;
  fullName: string;
  role: string;
  mobilityAidType: string | null;
}

export interface Comment {
  id: string;
  body: string;
  createdAt: string;
  author: CommentAuthor;
}

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getAccessToken();
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

export async function getComments(reportId: string): Promise<Comment[]> {
  try {
    const res = await fetch(`${API_BASE}/api/reports/${reportId}/comments/`, {
      headers: authHeaders(),
    });
    if (!res.ok) return [];
    return await res.json();
  } catch {
    return [];
  }
}

export async function postComment(
  reportId: string,
  body: string,
): Promise<Comment | null> {
  try {
    const res = await fetch(`${API_BASE}/api/reports/${reportId}/comments/`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ body }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
