import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
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
  mockPostUpvote.mockResolvedValue({ ok: true, data: { upvoteCount: 4, userUpvoted: true } });
  mockPostFlag.mockResolvedValue({ ok: true, data: { flagCount: 2, userFlagged: true } });
});

it('calls onUpdate optimistically and calls postUpvote on tap', async () => {
  const onUpdate = jest.fn();
  const { getByTestId } = render(<InteractionBar {...BASE_PROPS} onUpdate={onUpdate} />);

  fireEvent.press(getByTestId('upvote-button'));

  expect(onUpdate).toHaveBeenCalledWith({ upvoteCount: 4, userUpvoted: true });
  await waitFor(() => expect(mockPostUpvote).toHaveBeenCalledWith('report-123'));
});

it('shows disabled views and hides interactive buttons when user is the reporter', () => {
  const { getByTestId, queryByTestId } = render(
    <InteractionBar {...BASE_PROPS} currentUserId="reporter-456" reporterId="reporter-456" />,
  );

  expect(getByTestId('upvote-disabled')).toBeTruthy();
  expect(getByTestId('flag-disabled')).toBeTruthy();
  expect(queryByTestId('upvote-button')).toBeNull();
  expect(queryByTestId('flag-button')).toBeNull();
});

it('shows a sign-in alert and does not call the API when a guest taps upvote', () => {
  const alertSpy = jest.spyOn(Alert, 'alert');
  const { getByTestId } = render(<InteractionBar {...BASE_PROPS} currentUserId="" />);

  fireEvent.press(getByTestId('upvote-button'));

  expect(alertSpy).toHaveBeenCalledWith(
    expect.stringContaining('Sign in'),
    expect.any(String),
  );
  expect(mockPostUpvote).not.toHaveBeenCalled();
});
