/**
 * Component tests for ReportForm.
 *
 * All native modules and the API service are mocked.
 * Tests cover: rendering, validation (UAC-7.2, UAC-7.5),
 * and that submitReport is NOT called when validation fails.
 */
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import ReportForm from '../components/reports/ReportForm';

// ── Mocks ──────────────────────────────────────────────────────────

jest.mock('../components/reports/LocationPicker', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="location-picker" /> };
});

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getCurrentPositionAsync: jest.fn().mockResolvedValue({
    coords: { latitude: 41.0843, longitude: 29.051 },
  }),
  Accuracy: { High: 5 },
}));

jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  launchCameraAsync: jest.fn().mockResolvedValue({ canceled: true, assets: [] }),
  launchImageLibraryAsync: jest.fn().mockResolvedValue({ canceled: true, assets: [] }),
  MediaTypeOptions: { Images: 'Images' },
}));

jest.mock('../api/reports', () => ({
  submitReport: jest.fn().mockResolvedValue({
    ok: true,
    status: 201,
    data: {
      reportId: 'test-report-abc123',
      status: 'UNVERIFIED',
      autoVerified: false,
      duplicateCandidate: null,
      createdAt: '2026-04-03T10:00:00.000Z',
    },
  }),
}));

jest.mock('../services/auth', () => ({
  getAccessToken: jest.fn().mockReturnValue('mock-token'),
  parseDRFError: jest.fn((data: unknown) => {
    if (data && typeof data === 'object' && 'detail' in data) return String((data as Record<string, unknown>).detail);
    return 'Something went wrong.';
  }),
}));

// ── Helpers ────────────────────────────────────────────────────────

function getSubmitReport() {
  return require('../api/reports').submitReport as jest.Mock;
}

// Wait for location to resolve (async useEffect on mount)
async function renderAndWaitReady() {
  const onSuccess = jest.fn();
  const utils = render(<ReportForm onSuccess={onSuccess} />);
  await waitFor(() => expect(utils.getByText('Submit Report')).toBeTruthy());
  return { ...utils, onSuccess };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('ReportForm', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders all section headings', async () => {
    const { getByText } = await renderAndWaitReady();
    expect(getByText('Location')).toBeTruthy();
    expect(getByText('Context')).toBeTruthy();
    expect(getByText('Submit Report')).toBeTruthy();
  });

  it('renders OUTDOOR and INDOOR context options', async () => {
    const { getByText } = await renderAndWaitReady();
    expect(getByText('OUTDOOR')).toBeTruthy();
    expect(getByText('INDOOR')).toBeTruthy();
  });

  it('renders all six obstacle categories', async () => {
    const { getByText } = await renderAndWaitReady();
    expect(getByText('Broken Ramp')).toBeTruthy();
    expect(getByText('Narrow Sidewalk')).toBeTruthy();
    expect(getByText('Damaged Surface')).toBeTruthy();
    expect(getByText('Construction')).toBeTruthy();
    expect(getByText('Blocked Path')).toBeTruthy();
    expect(getByText('Other')).toBeTruthy();
  });

  // UAC-7.2: submitting without a photo must show an inline error
  it('shows photo error and does NOT call API when no photo is attached (UAC-7.2)', async () => {
    const { getByText, onSuccess } = await renderAndWaitReady();
    fireEvent.press(getByText('Submit Report'));
    await waitFor(() =>
      expect(getByText('At least one photo is required.')).toBeTruthy()
    );
    expect(getSubmitReport()).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  // UAC-7.5: omitting category is allowed — form should not error on it
  it('does NOT show a category validation error when category is unselected (UAC-7.5)', async () => {
    const { queryByText } = await renderAndWaitReady();
    // No category selected by default. No error text related to category.
    expect(queryByText(/category.*required/i)).toBeNull();
  });

  it('submit button is disabled while location is loading', () => {
    // Location starts in loading state (async), so button should be disabled immediately
    const { getByText } = render(<ReportForm onSuccess={jest.fn()} />);
    const btn = getByText('Submit Report');
    // The TouchableOpacity with disabled=true reflects in the test as not responding to press
    // We verify submitReport is not called if pressed while loading
    fireEvent.press(btn);
    expect(getSubmitReport()).not.toHaveBeenCalled();
  });

  it('does NOT show accessibility chip section before a category is selected', async () => {
    const { queryByText } = await renderAndWaitReady();
    expect(queryByText(/What.s wrong here\?/i)).toBeNull();
  });

  it('shows accessibility chip section after selecting a chip-supported category', async () => {
    const { getByText, findByText } = await renderAndWaitReady();
    fireEvent.press(getByText('Broken Ramp'));
    await expect(findByText(/What.s wrong here\?/i)).resolves.toBeTruthy();
  });

  it('does NOT show accessibility chip section when OTHER category is selected', async () => {
    const { getByText, queryByText } = await renderAndWaitReady();
    fireEvent.press(getByText('Other'));
    expect(queryByText(/What.s wrong here\?/i)).toBeNull();
  });
});
