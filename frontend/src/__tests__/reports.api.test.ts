/**
 * Unit tests for submitReport() API function.
 *
 * MOCK=false: tests run against a mocked fetch to verify the real
 * request path, including coordinate rounding.
 */
import { submitReport } from '../api/reports';
import type { SubmitReportResponse } from '../types/report'; // used as cast in assertions

const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
  mockFetch.mockClear();
  mockFetch.mockResolvedValue({
    ok: true,
    status: 201,
    json: async () => ({
      reportId: 'real-backend-id',
      status: 'UNVERIFIED',
      autoVerified: false,
      duplicateCandidate: null,
      createdAt: new Date().toISOString(),
    }),
  });
});

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
    const d = data as SubmitReportResponse;
    expect(typeof d.reportId).toBe('string');
    expect(d.status).toBe('UNVERIFIED');
    expect(d.autoVerified).toBe(false);
    expect(d.duplicateCandidate).toBeNull();
    expect(typeof d.createdAt).toBe('string');
  });

  it('generates a non-empty reportId string', async () => {
    const { data } = await submitReport(BASE_PAYLOAD);
    expect((data as SubmitReportResponse).reportId.length).toBeGreaterThan(0);
  });

  it('accepts null category (optional field per UAC-7.5)', async () => {
    const res = await submitReport({ ...BASE_PAYLOAD, category: null });
    expect(res.ok).toBe(true);
    expect((res.data as SubmitReportResponse).status).toBe('UNVERIFIED');
  });

  it('accepts INDOOR context', async () => {
    const res = await submitReport({ ...BASE_PAYLOAD, context: 'INDOOR' });
    expect(res.ok).toBe(true);
  });

  it('returns a valid ISO 8601 createdAt timestamp', async () => {
    const { data } = await submitReport(BASE_PAYLOAD);
    const createdAt = (data as SubmitReportResponse).createdAt;
    expect(new Date(createdAt).toISOString()).toBe(createdAt);
  });

  it('rounds coordinates to 6 decimal places before sending', async () => {
    await submitReport({
      ...BASE_PAYLOAD,
      location: { lat: 41.084312345678, lng: 29.051987654321 },
    });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.location.lat).toBe(41.084312);
    expect(body.location.lng).toBe(29.051988);
  });
});
