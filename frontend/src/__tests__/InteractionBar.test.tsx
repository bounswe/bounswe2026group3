import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { Alert } from 'react-native';
import InteractionBar from '../components/reports/InteractionBar';
import * as interactionsApi from '../api/interactions';

jest.mock('../api/interactions');
const mockPostUpvote = interactionsApi.postUpvote as jest.MockedFunction<typeof interactionsApi.postUpvote>;
const mockPostFlag = interactionsApi.postFlag as jest.MockedFunction<typeof interactionsApi.postFlag>;

const BASE_PROPS = {
  reportId: 'report-123',
  reporterId: 'reporter-456',
  upvoteCount: 3,
  flagCount: 1,
  userUpvoted: false,
  userFlagged: false,
  currentUserId: 'user-789',
  onUpdate: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  mockPostUpvote.mockResolvedValue({ ok: true, status: 200, data: { upvoteCount: 4, userUpvoted: true } });
  mockPostFlag.mockResolvedValue({ ok: true, status: 200, data: { flagCount: 2, userFlagged: true } });
});

// ── Upvote ────────────────────────────────────────────────────────────────────

it('optimistically increments count and sets userUpvoted when toggling ON', async () => {
  const onUpdate = jest.fn();
  const { getByTestId } = render(<InteractionBar {...BASE_PROPS} onUpdate={onUpdate} />);

  fireEvent.press(getByTestId('upvote-button'));

  expect(onUpdate).toHaveBeenNthCalledWith(1, { upvoteCount: 4, userUpvoted: true });
  await waitFor(() => expect(mockPostUpvote).toHaveBeenCalledWith('report-123'));
});

it('optimistically decrements count and clears userUpvoted when toggling OFF', async () => {
  const onUpdate = jest.fn();
  const { getByTestId } = render(
    <InteractionBar {...BASE_PROPS} userUpvoted={true} upvoteCount={4} onUpdate={onUpdate} />,
  );

  fireEvent.press(getByTestId('upvote-button'));

  expect(onUpdate).toHaveBeenNthCalledWith(1, { upvoteCount: 3, userUpvoted: false });
});

it('reconciles upvote count and state from server response', async () => {
  mockPostUpvote.mockResolvedValue({ ok: true, status: 200, data: { upvoteCount: 5, userUpvoted: true } });
  const onUpdate = jest.fn();
  const { getByTestId } = render(<InteractionBar {...BASE_PROPS} onUpdate={onUpdate} />);

  fireEvent.press(getByTestId('upvote-button'));

  await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(2));
  expect(onUpdate).toHaveBeenNthCalledWith(2, expect.objectContaining({ upvoteCount: 5, userUpvoted: true }));
});

it('rolls back optimistic upvote update on API failure', async () => {
  mockPostUpvote.mockResolvedValue({ ok: false, status: 500, data: {} });
  const onUpdate = jest.fn();
  const { getByTestId } = render(<InteractionBar {...BASE_PROPS} onUpdate={onUpdate} />);

  await act(async () => { fireEvent.press(getByTestId('upvote-button')); });

  expect(onUpdate).toHaveBeenNthCalledWith(2, { upvoteCount: 3, userUpvoted: false });
});

it('shows conflict alert without calling API when user has flagged the report', () => {
  const alertSpy = jest.spyOn(Alert, 'alert');
  const onUpdate = jest.fn();
  const { getByTestId } = render(
    <InteractionBar {...BASE_PROPS} userFlagged={true} onUpdate={onUpdate} />,
  );

  fireEvent.press(getByTestId('upvote-button'));

  expect(alertSpy).toHaveBeenCalledWith('Cannot upvote', expect.stringContaining('flagged'));
  expect(mockPostUpvote).not.toHaveBeenCalled();
  expect(onUpdate).not.toHaveBeenCalled();
});

it('ignores duplicate taps while upvote request is in flight', async () => {
  let resolve!: (v: any) => void;
  mockPostUpvote.mockReturnValue(new Promise(r => { resolve = r; }));
  const { getByTestId } = render(<InteractionBar {...BASE_PROPS} onUpdate={jest.fn()} />);

  fireEvent.press(getByTestId('upvote-button'));
  fireEvent.press(getByTestId('upvote-button'));

  expect(mockPostUpvote).toHaveBeenCalledTimes(1);

  await act(async () => { resolve({ ok: true, status: 200, data: {} }); });
});

// ── Flag ──────────────────────────────────────────────────────────────────────

it('optimistically increments flagCount and sets userFlagged when toggling ON', async () => {
  const onUpdate = jest.fn();
  const { getByTestId } = render(<InteractionBar {...BASE_PROPS} onUpdate={onUpdate} />);

  fireEvent.press(getByTestId('flag-button'));

  expect(onUpdate).toHaveBeenNthCalledWith(1, { flagCount: 2, userFlagged: true });
  await waitFor(() => expect(mockPostFlag).toHaveBeenCalledWith('report-123'));
});

it('optimistically decrements flagCount and clears userFlagged when toggling OFF', async () => {
  const onUpdate = jest.fn();
  const { getByTestId } = render(
    <InteractionBar {...BASE_PROPS} userFlagged={true} flagCount={2} onUpdate={onUpdate} />,
  );

  fireEvent.press(getByTestId('flag-button'));

  expect(onUpdate).toHaveBeenNthCalledWith(1, { flagCount: 1, userFlagged: false });
});

it('reconciles flag count and state from server response', async () => {
  mockPostFlag.mockResolvedValue({ ok: true, status: 200, data: { flagCount: 3, userFlagged: true } });
  const onUpdate = jest.fn();
  const { getByTestId } = render(<InteractionBar {...BASE_PROPS} onUpdate={onUpdate} />);

  fireEvent.press(getByTestId('flag-button'));

  await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(2));
  expect(onUpdate).toHaveBeenNthCalledWith(2, { flagCount: 3, userFlagged: true });
});

it('rolls back optimistic flag update on API failure', async () => {
  mockPostFlag.mockResolvedValue({ ok: false, status: 500, data: {} });
  const onUpdate = jest.fn();
  const { getByTestId } = render(<InteractionBar {...BASE_PROPS} onUpdate={onUpdate} />);

  await act(async () => { fireEvent.press(getByTestId('flag-button')); });

  expect(onUpdate).toHaveBeenNthCalledWith(2, { flagCount: 1, userFlagged: false });
});

it('shows conflict alert without calling API when user has upvoted the report', () => {
  const alertSpy = jest.spyOn(Alert, 'alert');
  const onUpdate = jest.fn();
  const { getByTestId } = render(
    <InteractionBar {...BASE_PROPS} userUpvoted={true} onUpdate={onUpdate} />,
  );

  fireEvent.press(getByTestId('flag-button'));

  expect(alertSpy).toHaveBeenCalledWith('Cannot flag', expect.stringContaining('upvoted'));
  expect(mockPostFlag).not.toHaveBeenCalled();
  expect(onUpdate).not.toHaveBeenCalled();
});

it('ignores duplicate taps while flag request is in flight', async () => {
  let resolve!: (v: any) => void;
  mockPostFlag.mockReturnValue(new Promise(r => { resolve = r; }));
  const { getByTestId } = render(<InteractionBar {...BASE_PROPS} onUpdate={jest.fn()} />);

  fireEvent.press(getByTestId('flag-button'));
  fireEvent.press(getByTestId('flag-button'));

  expect(mockPostFlag).toHaveBeenCalledTimes(1);

  await act(async () => { resolve({ ok: true, status: 200, data: {} }); });
});

// ── Reporter / guest guards ───────────────────────────────────────────────────

it('shows disabled views and hides interactive buttons when user is the reporter', () => {
  const { getByTestId, queryByTestId } = render(
    <InteractionBar {...BASE_PROPS} currentUserId="reporter-456" reporterId="reporter-456" />,
  );

  expect(getByTestId('upvote-disabled')).toBeTruthy();
  expect(getByTestId('flag-disabled')).toBeTruthy();
  expect(queryByTestId('upvote-button')).toBeNull();
  expect(queryByTestId('flag-button')).toBeNull();
});
