import { API_BASE } from '../constants/theme';
import { getAccessToken } from '../services/auth';

export type DashboardStatus =
  | 'VERIFIED'
  | 'RESOLVED_AWAITING_VALIDATION'
  | 'CLOSED';

export interface DashboardReport {
  reportId: string;
  title: string;
  description: string;
  category: string;
  context: 'OUTDOOR' | 'INDOOR';
  status: DashboardStatus;
  location: { lat: number; lng: number };
  upvoteCount: number;
  thumbnailUrl: string | null;
  reporter: { userId: string; fullName: string };
  createdAt: string;
  updatedAt: string;
}

export interface DashboardCounts {
  verified: number;
  awaitingValidation: number;
  closed: number;
  total: number;
}

export interface DashboardResponse {
  reports: DashboardReport[];
  pagination: { page: number; size: number; totalItems: number };
  counts: DashboardCounts;
}

function authHeaders(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  const t = getAccessToken();
  if (t) h['Authorization'] = `Bearer ${t}`;
  return h;
}

export async function fetchAuthorityDashboard(opts: {
  status?: DashboardStatus | null;
  page?: number;
  size?: number;
} = {}): Promise<{ ok: boolean; status: number; data: DashboardResponse | { detail?: string } }> {
  const params = new URLSearchParams();
  if (opts.status) params.set('status', opts.status);
  if (opts.page) params.set('page', String(opts.page));
  if (opts.size) params.set('size', String(opts.size));
  const qs = params.toString();
  const url = `${API_BASE}/api/authority/dashboard${qs ? `?${qs}` : ''}`;
  try {
    const res = await fetch(url, { headers: authHeaders() });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { detail: 'Network error.' } };
  }
}

export interface ResolveReportPayload {
  repairPhoto: string;
  repairNotes?: string;
}

export interface ResolveReportResponse {
  reportId: string;
  status: string;
  repairPhotoUrl: string;
  updatedAt: string;
}

export async function resolveReport(
  reportId: string,
  payload: ResolveReportPayload,
): Promise<{ ok: boolean; status: number; data: ResolveReportResponse | { detail?: string } }> {
  try {
    const res = await fetch(
      `${API_BASE}/api/authority/reports/${reportId}/resolve`,
      {
        method: 'PATCH',
        headers: authHeaders(),
        body: JSON.stringify(payload),
      },
    );
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { detail: 'Network error.' } };
  }
}
