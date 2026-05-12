/**
 * Component tests for MobilityProfileCard + AidTypeChips (Issue #91).
 * The useMobilityProfile hook is mocked so tests run synchronously
 * without any network or timer dependencies.
 */

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { MobilityProfileCard } from '../components/profile/MobilityProfileCard';
import * as hookModule from '../hooks/useMobilityProfile';
import { MobilityProfile } from '../types/mobilityProfile';

jest.mock('../hooks/useMobilityProfile');
const mockUseHook = hookModule.useMobilityProfile as jest.MockedFunction<
  typeof hookModule.useMobilityProfile
>;

const MOCK_PROFILE: MobilityProfile = {
  profileId: 'test-id',
  mobilityAid: 'WHEELCHAIR',
  avoidStairs: true,
  avoidSteepSlopes: false,
  maxSlopeGradient: null,
  createdAt: '2026-04-01T00:00:00Z',
};

const baseHook = {
  profile: null,
  loading: false,
  error: '',
  save: jest.fn(),
  reload: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
});

// ── 1 ────────────────────────────────────────────────────────────────────────
it('shows a loading spinner while the profile is being fetched', () => {
  mockUseHook.mockReturnValue({ ...baseHook, loading: true });
  const { getByTestId } = render(<MobilityProfileCard />);
  expect(getByTestId('loading-spinner')).toBeTruthy();
});

// ── 2 ────────────────────────────────────────────────────────────────────────
it('shows the setup prompt when there is no profile and not loading', () => {
  mockUseHook.mockReturnValue({ ...baseHook, profile: null });
  const { getByTestId } = render(<MobilityProfileCard />);
  expect(getByTestId('setup-prompt')).toBeTruthy();
});

// ── 3 ────────────────────────────────────────────────────────────────────────
it('does not show the edit button when no profile exists yet', () => {
  mockUseHook.mockReturnValue({ ...baseHook, profile: null });
  const { queryByTestId } = render(<MobilityProfileCard />);
  expect(queryByTestId('edit-button')).toBeNull();
});

// ── 4 ────────────────────────────────────────────────────────────────────────
it('renders the profile data in view mode when a profile exists', () => {
  mockUseHook.mockReturnValue({ ...baseHook, profile: MOCK_PROFILE });
  const { getByText, queryByTestId } = render(<MobilityProfileCard />);

  expect(getByText('Wheelchair')).toBeTruthy();
  expect(getByText('Avoid stairs')).toBeTruthy();
  expect(queryByTestId('setup-prompt')).toBeNull();
});

// ── 5 ────────────────────────────────────────────────────────────────────────
it('switches to edit mode when the edit button is pressed', () => {
  mockUseHook.mockReturnValue({ ...baseHook, profile: MOCK_PROFILE });
  const { getByTestId, queryByTestId } = render(<MobilityProfileCard />);

  fireEvent.press(getByTestId('edit-button'));

  expect(getByTestId('save-button')).toBeTruthy();
  expect(getByTestId('cancel-button')).toBeTruthy();
  expect(queryByTestId('edit-button')).toBeNull();
});

// ── 6 ────────────────────────────────────────────────────────────────────────
it('exits edit mode without saving when Cancel is pressed', () => {
  const mockSave = jest.fn();
  mockUseHook.mockReturnValue({ ...baseHook, profile: MOCK_PROFILE, save: mockSave });
  const { getByTestId, queryByTestId } = render(<MobilityProfileCard />);

  fireEvent.press(getByTestId('edit-button'));
  fireEvent.press(getByTestId('cancel-button'));

  expect(mockSave).not.toHaveBeenCalled();
  expect(queryByTestId('save-button')).toBeNull();
  expect(getByTestId('edit-button')).toBeTruthy();
});

// ── 7 ────────────────────────────────────────────────────────────────────────
it('renders all 7 aid type chips in edit mode', () => {
  mockUseHook.mockReturnValue({ ...baseHook, profile: null });
  const { getByTestId } = render(<MobilityProfileCard />);

  fireEvent.press(getByTestId('setup-prompt'));

  const ALL_AID_VALUES = [
    'WHEELCHAIR', 'ELECTRIC_WHEELCHAIR', 'WALKER',
    'CRUTCHES', 'STROLLER', 'HAND_CART', 'NONE',
  ];
  for (const value of ALL_AID_VALUES) {
    expect(getByTestId(`chip-${value}`)).toBeTruthy();
  }
});

// ── 8 ────────────────────────────────────────────────────────────────────────
it('calls save with the correct payload when the form is valid', async () => {
  const mockSave = jest.fn().mockResolvedValue(undefined);
  mockUseHook.mockReturnValue({ ...baseHook, profile: null, save: mockSave });
  const { getByTestId } = render(<MobilityProfileCard />);

  fireEvent.press(getByTestId('setup-prompt'));
  fireEvent.press(getByTestId('chip-WHEELCHAIR'));
  fireEvent(getByTestId('avoid-stairs-switch'), 'valueChange', true);
  fireEvent(getByTestId('avoid-slopes-switch'), 'valueChange', true);
  fireEvent.press(getByTestId('save-button'));

  await waitFor(() => {
    expect(mockSave).toHaveBeenCalledWith({
      mobilityAid: 'WHEELCHAIR',
      avoidStairs: true,
      avoidSteepSlopes: true,
      maxSlopeGradient: null,
    });
  });
});

// ── 9 ────────────────────────────────────────────────────────────────────────
it('shows only the selected aid type in view mode, not all chips', () => {
  mockUseHook.mockReturnValue({ ...baseHook, profile: MOCK_PROFILE }); // WHEELCHAIR selected
  const { getByText, queryByText } = render(<MobilityProfileCard />);

  expect(getByText('Wheelchair')).toBeTruthy();
  // Other aid types must not be rendered
  expect(queryByText('Walker')).toBeNull();
  expect(queryByText('Elec. Chair')).toBeNull();
  expect(queryByText('Crutches')).toBeNull();
});

// ── 10 ───────────────────────────────────────────────────────────────────────
it('shows an error banner when save throws', async () => {
  const mockSave = jest.fn().mockRejectedValue(new Error('Network error'));
  mockUseHook.mockReturnValue({ ...baseHook, profile: null, save: mockSave });
  const { getByTestId, getByText } = render(<MobilityProfileCard />);

  fireEvent.press(getByTestId('setup-prompt'));
  fireEvent.press(getByTestId('save-button'));

  await waitFor(() => {
    expect(getByText('Failed to save. Please try again.')).toBeTruthy();
  });
});
