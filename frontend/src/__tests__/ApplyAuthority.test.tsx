import React from 'react';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import ApplyAuthorityScreen from '../../app/apply-authority';

const mockBack = jest.fn();
jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockBack }) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});
afterEach(() => {
  jest.useRealTimers();
});

function setup() {
  return render(<ApplyAuthorityScreen />);
}

// ── Rendering ────────────────────────────────────────────────────────────────

it('renders the reason input and submit button', () => {
  const { getByTestId } = setup();
  expect(getByTestId('reason-input')).toBeTruthy();
  expect(getByTestId('submit-button')).toBeTruthy();
});

// ── Validation — reason ──────────────────────────────────────────────────────

it('shows error when reason is empty on submit', async () => {
  const { getByTestId, getByText } = setup();
  fireEvent.press(getByTestId('submit-button'));
  await waitFor(() => expect(getByText(/why you.re applying/i)).toBeTruthy());
});

it('shows char-count error when reason is too short', async () => {
  const { getByTestId, getByText } = setup();
  fireEvent.changeText(getByTestId('reason-input'), 'Too short');
  fireEvent.press(getByTestId('submit-button'));
  await waitFor(() => expect(getByText(/at least 30 characters/i)).toBeTruthy());
});

// ── Validation — org email ───────────────────────────────────────────────────

it('shows error for invalid org email format', async () => {
  const { getByTestId, getByText } = setup();
  fireEvent.changeText(getByTestId('reason-input'), 'A'.repeat(30));
  fireEvent.changeText(getByTestId('org-email-input'), 'not-an-email');
  fireEvent.press(getByTestId('submit-button'));
  await waitFor(() => expect(getByText(/invalid email/i)).toBeTruthy());
});

it('accepts an empty org email as valid', async () => {
  const { getByTestId, queryByText } = setup();
  fireEvent.changeText(getByTestId('reason-input'), 'A'.repeat(30));
  fireEvent.press(getByTestId('submit-button'));
  await act(async () => { jest.runAllTimers(); });
  expect(queryByText(/invalid email/i)).toBeNull();
});

// ── Cancel ───────────────────────────────────────────────────────────────────

it('calls router.back() when cancel is pressed', () => {
  const { getByTestId } = setup();
  fireEvent.press(getByTestId('cancel-button'));
  expect(mockBack).toHaveBeenCalledTimes(1);
});

// ── Success state ────────────────────────────────────────────────────────────

it('shows success screen after valid submission', async () => {
  const { getByTestId, getByText } = setup();
  fireEvent.changeText(getByTestId('reason-input'), 'A'.repeat(30));
  fireEvent.press(getByTestId('submit-button'));
  await act(async () => { jest.runAllTimers(); });
  await waitFor(() => expect(getByTestId('back-to-profile')).toBeTruthy());
});

it('calls router.back() when "Back to profile" is pressed on success screen', async () => {
  const { getByTestId } = setup();
  fireEvent.changeText(getByTestId('reason-input'), 'A'.repeat(30));
  fireEvent.press(getByTestId('submit-button'));
  await act(async () => { jest.runAllTimers(); });
  await waitFor(() => expect(getByTestId('back-to-profile')).toBeTruthy());
  fireEvent.press(getByTestId('back-to-profile'));
  expect(mockBack).toHaveBeenCalledTimes(1);
});
