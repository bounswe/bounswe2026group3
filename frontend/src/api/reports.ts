import { API_BASE } from '../constants/theme';
import { getAccessToken } from '../services/auth';
import type { SubmitReportPayload, SubmitReportResponse } from '../types/report';

// TODO: Set MOCK = false once the backend implements POST /api/reports/
// Blocked by: apps/reports/views.py, urls.py, serializers.py are empty stubs.
// Schema note: DB Report model is also missing the `context` field — needs migration.
const MOCK = false;

export async function submitReport(
  payload: SubmitReportPayload,
): Promise<{ ok: boolean; status: number; data: SubmitReportResponse | Record<string, unknown> }> {
  if (MOCK) {
    await new Promise<void>(r => setTimeout(r, 1200));
    return {
      ok: true,
      status: 201,
      data: {
        reportId: `mock-${Date.now()}`,
        status: 'UNVERIFIED',
        autoVerified: false,
        duplicateCandidate: null,
        createdAt: new Date().toISOString(),
      } satisfies SubmitReportResponse,
    };
  }

  try {
    const res = await fetch(`${API_BASE}/api/reports/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getAccessToken()}`,
      },
      body: JSON.stringify({
        ...payload,
        // Backend DecimalField(max_digits=9, decimal_places=6) rejects raw GPS floats.
        // Round to 6 d.p. before sending (e.g. 41.084312345 → 41.084312).
        location: {
          lat: parseFloat(payload.location.lat.toFixed(6)),
          lng: parseFloat(payload.location.lng.toFixed(6)),
        },
      }),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch {
    return { ok: false, status: 0, data: { detail: 'Network error. Check your connection.' } };
  }
}
