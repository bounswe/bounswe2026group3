/**
 * Unit tests for the mobility profile API helpers.
 * Exercises the real (non-mock) path: every helper is expected to hit
 * `/api/users/me/mobility-profile` (issue #231 — the missing `/api/`
 * prefix that caused 404s in the wild).
 */

jest.mock('../services/auth', () => ({
  getAccessToken: () => 'mock-access-token',
}));

jest.mock('../constants/theme', () => ({
  API_BASE: 'http://test-host:8000',
  COLORS: {},
}));

let api: typeof import('../api/mobilityProfile');
let fetchMock: jest.Mock;

const SAMPLE_PROFILE = {
  profileId: 'p-1',
  mobilityAid: 'WHEELCHAIR',
  avoidStairs: true,
  avoidSteepSlopes: false,
  maxSlopeGradient: null,
  createdAt: '2026-05-10T12:00:00Z',
};

const EXPECTED_URL = 'http://test-host:8000/api/users/me/mobility-profile';

function mockResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

beforeEach(() => {
  jest.resetModules();
  fetchMock = jest.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
  api = require('../api/mobilityProfile');
  api.__resetMockForTest();
});

describe('getMobilityProfile', () => {
  it('hits /api/users/me/mobility-profile with auth header', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(200, SAMPLE_PROFILE));

    await api.getMobilityProfile();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(EXPECTED_URL);
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer mock-access-token',
    });
  });

  it('returns the parsed profile on 200', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(200, SAMPLE_PROFILE));
    const result = await api.getMobilityProfile();
    expect(result).toEqual(SAMPLE_PROFILE);
  });

  it('returns null on 404 (no profile yet)', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(404, { detail: 'not found' }));
    const result = await api.getMobilityProfile();
    expect(result).toBeNull();
  });

  it('throws on other non-ok responses', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(500, {}));
    await expect(api.getMobilityProfile()).rejects.toThrow();
  });
});

describe('createMobilityProfile', () => {
  const payload = {
    mobilityAid: 'CRUTCHES' as const,
    avoidStairs: true,
    avoidSteepSlopes: true,
    maxSlopeGradient: 8,
  };

  it('POSTs to /api/users/me/mobility-profile with payload as JSON body', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(201, SAMPLE_PROFILE));

    await api.createMobilityProfile(payload);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(EXPECTED_URL);
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse(String((init as RequestInit).body))).toEqual(payload);
  });

  it('returns the created profile from the response body', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(201, SAMPLE_PROFILE));
    const result = await api.createMobilityProfile(payload);
    expect(result).toEqual(SAMPLE_PROFILE);
  });

  it('throws on a non-ok response', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(400, { detail: 'bad' }));
    await expect(api.createMobilityProfile(payload)).rejects.toThrow();
  });
});

describe('updateMobilityProfile', () => {
  const payload = {
    mobilityAid: 'STROLLER' as const,
    avoidStairs: true,
    avoidSteepSlopes: true,
    maxSlopeGradient: 5,
  };

  it('PUTs to /api/users/me/mobility-profile with payload as JSON body', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(200, { ...SAMPLE_PROFILE, ...payload }));

    await api.updateMobilityProfile(payload);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(EXPECTED_URL);
    expect((init as RequestInit).method).toBe('PUT');
    expect(JSON.parse(String((init as RequestInit).body))).toEqual(payload);
  });

  it('returns the updated profile from the response body', async () => {
    const updated = { ...SAMPLE_PROFILE, ...payload };
    fetchMock.mockResolvedValueOnce(mockResponse(200, updated));
    const result = await api.updateMobilityProfile(payload);
    expect(result).toEqual(updated);
  });

  it('throws on a non-ok response', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(404, { detail: 'no profile' }));
    await expect(api.updateMobilityProfile(payload)).rejects.toThrow();
  });
});
