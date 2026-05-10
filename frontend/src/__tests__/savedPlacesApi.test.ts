/**
 * Unit tests for createSavedPlace — covers the new {ok, data|error} shape
 * and the wrapped-error envelope unwrapping (issue #232).
 */

jest.mock('../services/auth', () => ({
  getAccessToken: () => 'mock-access-token',
}));

jest.mock('../constants/theme', () => ({
  API_BASE: 'http://test-host:8000',
  COLORS: {},
}));

let api: typeof import('../api/savedPlaces');
let fetchMock: jest.Mock;

const PAYLOAD = {
  label: 'Home',
  latitude: 41.01145731,
  longitude: 28.97675230,
  address: 'Sample address',
};

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
  api = require('../api/savedPlaces');
});

describe('createSavedPlace', () => {
  it('returns { ok: true, data } on 201', async () => {
    const created = { id: 'p-1', ...PAYLOAD, createdAt: '2026-05-10T12:00:00Z' };
    fetchMock.mockResolvedValueOnce(mockResponse(201, created));

    const result = await api.createSavedPlace(PAYLOAD);

    expect(result).toEqual({ ok: true, data: created });
  });

  it('POSTs to /api/users/me/saved-places/ with the payload as JSON', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(201, {}));

    await api.createSavedPlace(PAYLOAD);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://test-host:8000/api/users/me/saved-places/');
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse(String((init as RequestInit).body))).toEqual(PAYLOAD);
  });

  it('returns { ok: false, error } unwrapping the wrapped envelope on 400', async () => {
    // Backend custom_exception_handler shape:
    fetchMock.mockResolvedValueOnce(
      mockResponse(400, {
        error: {
          code: 'invalid',
          detail: 'Ensure that there are no more than 8 decimal places.',
          timestamp: '2026-05-10T12:00:00Z',
        },
      }),
    );

    const result = await api.createSavedPlace(PAYLOAD);

    expect(result).toEqual({
      ok: false,
      error: 'Ensure that there are no more than 8 decimal places.',
    });
  });

  it('falls back to plain `detail` when the envelope is absent', async () => {
    fetchMock.mockResolvedValueOnce(
      mockResponse(400, { detail: 'Authentication credentials were not provided.' }),
    );

    const result = await api.createSavedPlace(PAYLOAD);

    expect(result).toEqual({
      ok: false,
      error: 'Authentication credentials were not provided.',
    });
  });

  it('falls back to a generic message when the body is unrecognisable', async () => {
    fetchMock.mockResolvedValueOnce(mockResponse(500, '<html>oops</html>'));

    const result = await api.createSavedPlace(PAYLOAD);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('Failed to save place. Please try again.');
    }
  });

  it('returns a network-error message when fetch itself throws', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Network request failed'));

    const result = await api.createSavedPlace(PAYLOAD);

    expect(result).toEqual({
      ok: false,
      error: 'Network error. Check your connection.',
    });
  });
});
