import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import ReportForm from '../components/reports/ReportForm';
import { searchLocations } from '../api/map';

jest.mock('../hooks/useLocation', () => ({
  useLocation: () => ({
    location: { lat: 41.0, lng: 29.0 },
    loading: false,
    error: null,
    permissionDenied: false,
    refetch: jest.fn(),
  }),
}));

jest.mock('../api/map', () => ({
  searchNominatim: jest.fn().mockResolvedValue([]),
  searchLocations: jest.fn().mockResolvedValue([
    { id: '1', name: 'Engineering Faculty', latitude: 41.08, longitude: 29.05 },
  ]),
}));

jest.mock('../api/reports', () => ({
  submitReport: jest.fn().mockResolvedValue({ ok: true, status: 201, data: {} }),
}));

jest.mock('../services/auth', () => ({
  parseDRFError: jest.fn().mockReturnValue('Server error'),
}));

jest.mock('../components/reports/PhotoPicker', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="photo-picker" /> };
});

jest.mock('../components/reports/LocationPicker', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="location-picker" /> };
});

const mockedSearchLocations = searchLocations as jest.MockedFunction<typeof searchLocations>;

describe('ReportForm — indoor fields', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockedSearchLocations.mockResolvedValue([
      { id: '1', name: 'Engineering Faculty', latitude: 41.08, longitude: 29.05 },
    ]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not show Indoor Details card when OUTDOOR is selected (default)', () => {
    const { queryByText } = render(<ReportForm onSuccess={jest.fn()} />);
    expect(queryByText('Indoor Details')).toBeNull();
  });

  it('shows Indoor Details card when INDOOR is selected', () => {
    const { getByText } = render(<ReportForm onSuccess={jest.fn()} />);
    fireEvent.press(getByText('INDOOR'));
    expect(getByText('Indoor Details')).toBeTruthy();
    expect(getByText(/Building name/)).toBeTruthy();
    expect(getByText(/Floor/)).toBeTruthy();
  });

  it('hides Indoor Details card when switching back to OUTDOOR', () => {
    const { getByText, queryByText } = render(<ReportForm onSuccess={jest.fn()} />);
    fireEvent.press(getByText('INDOOR'));
    expect(getByText('Indoor Details')).toBeTruthy();
    fireEvent.press(getByText('OUTDOOR'));
    expect(queryByText('Indoor Details')).toBeNull();
  });

  it('shows building suggestions when typing 2+ characters', async () => {
    const { getByText, getByPlaceholderText } = render(<ReportForm onSuccess={jest.fn()} />);
    fireEvent.press(getByText('INDOOR'));
    const input = getByPlaceholderText('Search building…');
    fireEvent.changeText(input, 'Eng');
    act(() => { jest.advanceTimersByTime(400); });
    await waitFor(() => {
      expect(getByText('Engineering Faculty')).toBeTruthy();
    });
  });

  it('fills building name when a suggestion is selected', async () => {
    const { getByText, getByPlaceholderText, queryByText } = render(<ReportForm onSuccess={jest.fn()} />);
    fireEvent.press(getByText('INDOOR'));
    const input = getByPlaceholderText('Search building…');
    fireEvent.changeText(input, 'Eng');
    act(() => { jest.advanceTimersByTime(400); });
    await waitFor(() => getByText('Engineering Faculty'));
    fireEvent.press(getByText('Engineering Faculty'));
    expect(input.props.value).toBe('Engineering Faculty');
    expect(queryByText('Engineering Faculty')).toBeNull();
  });
});
