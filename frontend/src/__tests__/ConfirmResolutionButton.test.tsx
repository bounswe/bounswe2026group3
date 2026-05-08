import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import ConfirmResolutionButton from '../components/reports/ConfirmResolutionButton';
import * as interactionsApi from '../api/interactions';

jest.mock('../api/interactions');
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

const mockConfirm = interactionsApi.confirmResolution as jest.MockedFunction<
  typeof interactionsApi.confirmResolution
>;

const BASE_PROPS = {
  reportId: 'r1',
  status: 'RESOLVED_AWAITING_VALIDATION',
  reporterId: 'reporter-1',
  userUpvoted: false,
  userConfirmed: false,
  confirmationCount: 1,
  currentUserId: 'reporter-1',
  onResolved: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  mockConfirm.mockResolvedValue({
    ok: true,
    data: { reportId: 'r1', status: 'RESOLVED_AWAITING_VALIDATION', confirmationCount: 2 },
  });
});

// ── Eligibility ─────────────────────────────────────────────────────────────

it('renders nothing when status is not RESOLVED_AWAITING_VALIDATION', () => {
  const { queryByTestId } = render(
    <ConfirmResolutionButton {...BASE_PROPS} status="VERIFIED" />,
  );
  expect(queryByTestId('confirm-resolution-button')).toBeNull();
  expect(queryByTestId('confirm-resolution-recorded')).toBeNull();
});

it('renders nothing for guests (no currentUserId)', () => {
  const { queryByTestId } = render(
    <ConfirmResolutionButton {...BASE_PROPS} currentUserId="" />,
  );
  expect(queryByTestId('confirm-resolution-button')).toBeNull();
});

it('renders nothing when the user is neither reporter nor upvoter', () => {
  const { queryByTestId } = render(
    <ConfirmResolutionButton
      {...BASE_PROPS}
      currentUserId="some-other-user"
      userUpvoted={false}
    />,
  );
  expect(queryByTestId('confirm-resolution-button')).toBeNull();
});

it('renders the button for the reporter', () => {
  const { getByTestId } = render(<ConfirmResolutionButton {...BASE_PROPS} />);
  expect(getByTestId('confirm-resolution-button')).toBeTruthy();
});

it('renders the button for an upvoter', () => {
  const { getByTestId } = render(
    <ConfirmResolutionButton
      {...BASE_PROPS}
      currentUserId="some-other-user"
      userUpvoted
    />,
  );
  expect(getByTestId('confirm-resolution-button')).toBeTruthy();
});

// ── userConfirmed pill ──────────────────────────────────────────────────────

it('shows the recorded pill instead of the button when userConfirmed is true', () => {
  const { getByTestId, queryByTestId } = render(
    <ConfirmResolutionButton {...BASE_PROPS} userConfirmed />,
  );
  expect(getByTestId('confirm-resolution-recorded')).toBeTruthy();
  expect(queryByTestId('confirm-resolution-button')).toBeNull();
});

// ── Click behavior ──────────────────────────────────────────────────────────

it('calls confirmResolution and forwards server status + count to onResolved', async () => {
  const onResolved = jest.fn();
  mockConfirm.mockResolvedValue({
    ok: true,
    data: { reportId: 'r1', status: 'CLOSED', confirmationCount: 3 },
  });

  const { getByTestId } = render(
    <ConfirmResolutionButton {...BASE_PROPS} onResolved={onResolved} />,
  );
  await act(async () => {
    fireEvent.press(getByTestId('confirm-resolution-button'));
  });

  expect(mockConfirm).toHaveBeenCalledWith('r1');
  expect(onResolved).toHaveBeenCalledWith('CLOSED', 3);
});

it('passes the awaiting status through when the threshold is not yet reached', async () => {
  const onResolved = jest.fn();
  mockConfirm.mockResolvedValue({
    ok: true,
    data: { reportId: 'r1', status: 'RESOLVED_AWAITING_VALIDATION', confirmationCount: 2 },
  });

  const { getByTestId } = render(
    <ConfirmResolutionButton {...BASE_PROPS} onResolved={onResolved} />,
  );
  await act(async () => {
    fireEvent.press(getByTestId('confirm-resolution-button'));
  });

  expect(onResolved).toHaveBeenCalledWith('RESOLVED_AWAITING_VALIDATION', 2);
});

it('shows an alert and does not call onResolved on API failure', async () => {
  const onResolved = jest.fn();
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  mockConfirm.mockResolvedValue({
    ok: false,
    data: { reportId: 'r1', status: '', confirmationCount: 0 },
  });

  const { getByTestId } = render(
    <ConfirmResolutionButton {...BASE_PROPS} onResolved={onResolved} />,
  );
  await act(async () => {
    fireEvent.press(getByTestId('confirm-resolution-button'));
  });

  expect(alertSpy).toHaveBeenCalled();
  expect(onResolved).not.toHaveBeenCalled();
  alertSpy.mockRestore();
});
