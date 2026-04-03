/**
 * Unit tests for submitReport() API function.
 *
 * These tests run against MOCK=true (the default while the backend
 * POST /api/reports/ endpoint is unimplemented). No network or
 * backend required — safe to run in CI.
 */
import { submitReport } from '../api/reports';

const BASE_PAYLOAD = {
  location: { lat: 41.0843, lng: 29.051 },
  context: 'OUTDOOR' as const,
  category: 'BROKEN_RAMP' as const,
  description: 'Cracked ramp near the library entrance.',
  photos: ['base64ImageData=='],
};

describe('submitReport (mock mode)', () => {
  it('resolves with ok:true and HTTP 201', async () => {
    const res = await submitReport(BASE_PAYLOAD);
    expect(res.ok).toBe(true);
    expect(res.status).toBe(201);
  });

  it('returns a response shaped like SubmitReportResponse', async () => {
    const { data } = await submitReport(BASE_PAYLOAD);
    expect(typeof data.reportId).toBe('string');
    expect(data.status).toBe('UNVERIFIED');
    expect(data.autoVerified).toBe(false);
    expect(data.duplicateCandidate).toBeNull();
    expect(typeof data.createdAt).toBe('string');
  });

  it('generates a non-empty reportId string', async () => {
    const { data } = await submitReport(BASE_PAYLOAD);
    expect(data.reportId.length).toBeGreaterThan(0);
  });

  it('accepts null category (optional field per UAC-7.5)', async () => {
    const res = await submitReport({ ...BASE_PAYLOAD, category: null });
    expect(res.ok).toBe(true);
    expect(res.data.status).toBe('UNVERIFIED');
  });

  it('accepts INDOOR context', async () => {
    const res = await submitReport({ ...BASE_PAYLOAD, context: 'INDOOR' });
    expect(res.ok).toBe(true);
  });

  it('returns a valid ISO 8601 createdAt timestamp', async () => {
    const { data } = await submitReport(BASE_PAYLOAD);
    expect(new Date(data.createdAt).toISOString()).toBe(data.createdAt);
  });
});
