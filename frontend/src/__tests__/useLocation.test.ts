/**
 * Unit tests for the useLocation hook.
 *
 * expo-location is fully mocked — no device or GPS required.
 */
import { renderHook, waitFor } from '@testing-library/react-native';
import { useLocation } from '../hooks/useLocation';
import * as Location from 'expo-location';

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { High: 5 },
}));

const mockRequestPermission = Location.requestForegroundPermissionsAsync as jest.Mock;
const mockGetPosition      = Location.getCurrentPositionAsync as jest.Mock;

const GRANTED  = { status: 'granted' };
const DENIED   = { status: 'denied' };
const MOCK_POS = { coords: { latitude: 41.0843, longitude: 29.051 } };

beforeEach(() => jest.clearAllMocks());

describe('useLocation', () => {
  it('starts in loading state', () => {
    mockRequestPermission.mockResolvedValue(GRANTED);
    mockGetPosition.mockResolvedValue(MOCK_POS);
    const { result } = renderHook(() => useLocation());
    expect(result.current.loading).toBe(true);
  });

  it('resolves location when permission is granted', async () => {
    mockRequestPermission.mockResolvedValue(GRANTED);
    mockGetPosition.mockResolvedValue(MOCK_POS);
    const { result } = renderHook(() => useLocation());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.location).toEqual({ lat: 41.0843, lng: 29.051 });
    expect(result.current.permissionDenied).toBe(false);
    expect(result.current.error).toBe('');
  });

  it('sets permissionDenied when permission is not granted', async () => {
    mockRequestPermission.mockResolvedValue(DENIED);
    const { result } = renderHook(() => useLocation());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.permissionDenied).toBe(true);
    expect(result.current.location).toBeNull();
    expect(result.current.error).toBe('');
  });

  it('sets error string when getCurrentPositionAsync rejects', async () => {
    mockRequestPermission.mockResolvedValue(GRANTED);
    mockGetPosition.mockRejectedValue(new Error('GPS unavailable'));
    const { result } = renderHook(() => useLocation());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeTruthy();
    expect(result.current.location).toBeNull();
    expect(result.current.permissionDenied).toBe(false);
  });

  it('exposes a refetch function that updates location', async () => {
    mockRequestPermission.mockResolvedValue(GRANTED);
    mockGetPosition
      .mockResolvedValueOnce({ coords: { latitude: 1.0, longitude: 2.0 } })
      .mockResolvedValueOnce({ coords: { latitude: 41.0843, longitude: 29.051 } });
    const { result } = renderHook(() => useLocation());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.location).toEqual({ lat: 1.0, lng: 2.0 });
    result.current.refetch();
    await waitFor(() => expect(result.current.location).toEqual({ lat: 41.0843, lng: 29.051 }));
  });
});
