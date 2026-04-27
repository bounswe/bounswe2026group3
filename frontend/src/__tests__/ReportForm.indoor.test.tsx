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
  getAccessToken: jest.fn().mockReturnValue('mock-token'),
}));

jest.mock('../components/reports/PhotoPicker', () => {
  const { View, TouchableOpacity, Text } = require('react-native');
  return {
    __esModule: true,
    default: ({ onAdd }: { onAdd: (p: { uri: string; b64: string }) => void }) => (
      <View testID="photo-picker">
        <TouchableOpacity testID="add-photo-btn" onPress={() => onAdd({ uri: 'mock-uri', b64: 'mock-b64' })}>
          <Text>Add Photo</Text>
        </TouchableOpacity>
      </View>
    ),
  };
});

jest.mock('../components/reports/LocationPicker', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="location-picker" /> };
});

const mockedSearchLocations = searchLocations as jest.MockedFunction<typeof searchLocations>;

describe('ReportForm — indoor fields', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockedSearchLocations.mockResolvedValue([
      { id: '1', name: 'Engineering Faculty', latitude: 41.08, longitude: 29.05 },
    ]);
    (require('../api/reports').submitReport as jest.Mock)
      .mockResolvedValue({ ok: true, status: 201, data: {} });
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
    await act(async () => { jest.advanceTimersByTime(400); });
    await waitFor(() => {
      expect(getByText('Engineering Faculty')).toBeTruthy();
    });
  });

  it('fills building name when a suggestion is selected', async () => {
    const { getByText, getByPlaceholderText, queryByText } = render(<ReportForm onSuccess={jest.fn()} />);
    fireEvent.press(getByText('INDOOR'));
    const input = getByPlaceholderText('Search building…');
    fireEvent.changeText(input, 'Eng');
    await act(async () => { jest.advanceTimersByTime(400); });
    await waitFor(() => getByText('Engineering Faculty'));
    fireEvent.press(getByText('Engineering Faculty'));
    expect(input.props.value).toBe('Engineering Faculty');
    expect(queryByText('Engineering Faculty')).toBeNull();
  });

  it('shows error and does not submit when INDOOR and building name is empty', async () => {
    const { submitReport } = require('../api/reports');
    const { getByText, getByTestId, queryByText } = render(<ReportForm onSuccess={jest.fn()} />);
    fireEvent.press(getByText('INDOOR'));
    // Add a photo so photo validation passes
    fireEvent.press(getByTestId('add-photo-btn'));
    // do not fill building name
    fireEvent.press(getByText('Submit Report'));
    await waitFor(() => {
      expect(getByText('Building name is required for indoor reports.')).toBeTruthy();
    });
    expect(submitReport).not.toHaveBeenCalled();
  });

  it('includes buildingName and isIndoor in payload when INDOOR and building name is filled', async () => {
    const { submitReport } = require('../api/reports');
    const { getByText, getByPlaceholderText, getByTestId } = render(<ReportForm onSuccess={jest.fn()} />);
    fireEvent.press(getByText('INDOOR'));
    // Add a photo so photo validation passes
    fireEvent.press(getByTestId('add-photo-btn'));
    fireEvent.changeText(getByPlaceholderText('Search building…'), 'Engineering Faculty');
    // Skip debounce — typing directly sets buildingName
    fireEvent.press(getByText('Submit Report'));
    await waitFor(() => {
      expect(submitReport).toHaveBeenCalledWith(
        expect.objectContaining({
          buildingName: 'Engineering Faculty',
          isIndoor: true,
          context: 'INDOOR',
        })
      );
    });
  });
});
