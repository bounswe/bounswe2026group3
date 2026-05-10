import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import ProfileScreen from '../../app/tabs/profile';
import * as auth from '../services/auth';
import * as savedPlacesApi from '../api/savedPlaces';

jest.mock('../services/auth');
jest.mock('../api/savedPlaces');
jest.mock('../components/profile/MobilityProfileCard', () => ({
  MobilityProfileCard: () => null,
}));
const mockRouter = { replace: jest.fn(), push: jest.fn() };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useFocusEffect: (cb: () => void) => {
    const React = require('react');
    React.useEffect(() => { cb(); }, [cb]);
  },
}));
jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

const mockIsLoggedIn = auth.isLoggedIn as jest.MockedFunction<typeof auth.isLoggedIn>;
const mockGetMe = auth.getMe as jest.MockedFunction<typeof auth.getMe>;
const mockGetSavedPlaces = savedPlacesApi.getSavedPlaces as jest.MockedFunction<typeof savedPlacesApi.getSavedPlaces>;
const mockDeleteSavedPlace = savedPlacesApi.deleteSavedPlace as jest.MockedFunction<typeof savedPlacesApi.deleteSavedPlace>;

const MOCK_USER = {
  userId: 'u1',
  email: 'test@example.com',
  fullName: 'Test User',
  status: 'ACTIVE',
  trustScore: 10,
  createdAt: '2026-01-01T00:00:00Z',
};

const MOCK_PLACES = [
  { id: 'p1', label: 'Home', latitude: 41.0, longitude: 29.0, address: '123 Main St', createdAt: '2026-01-01T00:00:00Z' },
  { id: 'p2', label: 'Work', latitude: 41.1, longitude: 29.1, address: undefined, createdAt: '2026-01-02T00:00:00Z' },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockIsLoggedIn.mockReturnValue(true);
  mockGetMe.mockResolvedValue({ ok: true, status: 200, data: MOCK_USER });
  mockGetSavedPlaces.mockResolvedValue([]);
  mockDeleteSavedPlace.mockResolvedValue(true);
});

it('shows empty state when there are no saved places', async () => {
  mockGetSavedPlaces.mockResolvedValue([]);
  const { getByTestId } = render(<ProfileScreen />);

  await waitFor(() => expect(getByTestId('saved-places-empty')).toBeTruthy());
});

it('renders saved place items with their labels', async () => {
  mockGetSavedPlaces.mockResolvedValue(MOCK_PLACES);
  const { getByTestId, getByText } = render(<ProfileScreen />);

  await waitFor(() => {
    expect(getByTestId('saved-place-p1')).toBeTruthy();
    expect(getByTestId('saved-place-p2')).toBeTruthy();
    expect(getByText('Home')).toBeTruthy();
    expect(getByText('Work')).toBeTruthy();
  });
});

it('renders the address when present', async () => {
  mockGetSavedPlaces.mockResolvedValue(MOCK_PLACES);
  const { getByText } = render(<ProfileScreen />);

  await waitFor(() => expect(getByText('123 Main St')).toBeTruthy());
});

it('calls deleteSavedPlace and removes item when delete is pressed', async () => {
  mockGetSavedPlaces.mockResolvedValue(MOCK_PLACES);
  const { getByTestId, queryByTestId } = render(<ProfileScreen />);

  await waitFor(() => expect(getByTestId('delete-place-p1')).toBeTruthy());

  await act(async () => {
    fireEvent.press(getByTestId('delete-place-p1'));
  });

  expect(mockDeleteSavedPlace).toHaveBeenCalledWith('p1');
  expect(queryByTestId('saved-place-p1')).toBeNull();
});

it('keeps the item if deletion fails', async () => {
  mockDeleteSavedPlace.mockResolvedValue(false);
  mockGetSavedPlaces.mockResolvedValue(MOCK_PLACES);
  const { getByTestId } = render(<ProfileScreen />);

  await waitFor(() => expect(getByTestId('delete-place-p1')).toBeTruthy());

  await act(async () => {
    fireEvent.press(getByTestId('delete-place-p1'));
  });

  expect(mockDeleteSavedPlace).toHaveBeenCalledWith('p1');
  expect(getByTestId('saved-place-p1')).toBeTruthy();
});
