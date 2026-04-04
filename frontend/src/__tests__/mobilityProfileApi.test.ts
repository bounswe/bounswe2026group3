/**
 * Unit tests for the mobility profile mock API service.
 * These tests exercise the mock path (MOCK = true) which is the active
 * code path until the backend implements the endpoints.
 */

jest.mock('../services/auth', () => ({
  getAccessToken: () => 'mock-access-token',
}));

// Isolate module state between tests by re-importing after each reset
let api: typeof import('../api/mobilityProfile');

beforeEach(() => {
  jest.useFakeTimers();
  jest.resetModules();
  api = require('../api/mobilityProfile');
});

afterEach(() => {
  jest.useRealTimers();
});

async function flush() {
  // Advance fake timers past the 400 ms mock delay and let promises settle
  jest.runAllTimers();
  await Promise.resolve();
}

describe('getMobilityProfile', () => {
  it('returns null when no profile has been created', async () => {
    const promise = api.getMobilityProfile();
    await flush();
    const result = await promise;
    expect(result).toBeNull();
  });

  it('returns the stored profile after createMobilityProfile is called', async () => {
    const createPromise = api.createMobilityProfile({
      mobilityAid: 'WHEELCHAIR',
      avoidStairs: true,
      avoidSteepSlopes: false,
      maxSlopeGradient: null,
    });
    await flush();
    await createPromise;

    const getPromise = api.getMobilityProfile();
    await flush();
    const result = await getPromise;

    expect(result).not.toBeNull();
    expect(result!.mobilityAid).toBe('WHEELCHAIR');
    expect(result!.avoidStairs).toBe(true);
  });
});

describe('createMobilityProfile', () => {
  it('creates a profile with all provided fields', async () => {
    const promise = api.createMobilityProfile({
      mobilityAid: 'CRUTCHES',
      avoidStairs: true,
      avoidSteepSlopes: true,
      maxSlopeGradient: 8,
    });
    await flush();
    const result = await promise;

    expect(result.profileId).toBeDefined();
    expect(result.mobilityAid).toBe('CRUTCHES');
    expect(result.avoidStairs).toBe(true);
    expect(result.avoidSteepSlopes).toBe(true);
    expect(result.maxSlopeGradient).toBe(8);
    expect(result.createdAt).toBeDefined();
  });
});

describe('updateMobilityProfile', () => {
  it('updates an existing profile and preserves profileId', async () => {
    // First create
    const createPromise = api.createMobilityProfile({
      mobilityAid: 'WALKER',
      avoidStairs: false,
      avoidSteepSlopes: false,
      maxSlopeGradient: null,
    });
    await flush();
    const created = await createPromise;

    // Then update
    const updatePromise = api.updateMobilityProfile({
      mobilityAid: 'STROLLER',
      avoidStairs: true,
      avoidSteepSlopes: true,
      maxSlopeGradient: 5,
    });
    await flush();
    const updated = await updatePromise;

    expect(updated.profileId).toBe(created.profileId);
    expect(updated.mobilityAid).toBe('STROLLER');
    expect(updated.avoidStairs).toBe(true);
    expect(updated.maxSlopeGradient).toBe(5);
  });

  it('reflects the update when getMobilityProfile is called afterwards', async () => {
    const createPromise = api.createMobilityProfile({
      mobilityAid: 'NONE',
      avoidStairs: false,
      avoidSteepSlopes: false,
      maxSlopeGradient: null,
    });
    await flush();
    await createPromise;

    const updatePromise = api.updateMobilityProfile({
      mobilityAid: 'HAND_CART',
      avoidStairs: false,
      avoidSteepSlopes: true,
      maxSlopeGradient: 10,
    });
    await flush();
    await updatePromise;

    const getPromise = api.getMobilityProfile();
    await flush();
    const result = await getPromise;

    expect(result!.mobilityAid).toBe('HAND_CART');
    expect(result!.maxSlopeGradient).toBe(10);
  });
});
