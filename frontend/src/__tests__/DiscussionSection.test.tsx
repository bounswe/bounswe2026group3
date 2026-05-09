import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import DiscussionSection from '../components/reports/DiscussionSection';
import * as commentsApi from '../api/comments';

jest.mock('../api/comments');
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));
jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: (props: any) => React.createElement(View, props),
    Path: (props: any) => React.createElement(View, props),
    Circle: (props: any) => React.createElement(View, props),
    Defs: (props: any) => React.createElement(View, props),
    LinearGradient: (props: any) => React.createElement(View, props),
    Stop: (props: any) => React.createElement(View, props),
    Svg: (props: any) => React.createElement(View, props),
  };
});

const mockGetComments = commentsApi.getComments as jest.MockedFunction<typeof commentsApi.getComments>;
const mockPostComment = commentsApi.postComment as jest.MockedFunction<typeof commentsApi.postComment>;

function makeComment(overrides: Partial<commentsApi.Comment> = {}): commentsApi.Comment {
  return {
    id: 'c1',
    body: 'The ramp is still broken.',
    createdAt: new Date().toISOString(),
    author: {
      userId: 'u1',
      fullName: 'Ayşe Y.',
      role: 'REGISTERED_USER',
      mobilityAidType: null,
    },
    ...overrides,
  };
}

const BASE_PROPS = {
  reportId: 'r1',
  currentUserId: 'user-1',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockGetComments.mockResolvedValue([]);
  mockPostComment.mockResolvedValue(makeComment({ id: 'c-new', body: 'New comment' }));
});

// ── Rendering ─────────────────────────────────────────────────────────────────

it('shows empty state when there are no comments', async () => {
  const { getByTestId } = render(<DiscussionSection {...BASE_PROPS} />);
  await waitFor(() => expect(getByTestId('discussion-empty')).toBeTruthy());
});

it('renders a row for each comment', async () => {
  mockGetComments.mockResolvedValue([
    makeComment({ id: 'c1' }),
    makeComment({ id: 'c2', body: 'Second comment' }),
  ]);
  const { getByTestId } = render(<DiscussionSection {...BASE_PROPS} />);
  await waitFor(() => {
    expect(getByTestId('comment-c1')).toBeTruthy();
    expect(getByTestId('comment-c2')).toBeTruthy();
  });
});

it('renders the author name for each comment', async () => {
  mockGetComments.mockResolvedValue([makeComment({ id: 'c1', author: { userId: 'u1', fullName: 'Mehmet K.', role: 'REGISTERED_USER', mobilityAidType: null } })]);
  const { getByTestId } = render(<DiscussionSection {...BASE_PROPS} />);
  await waitFor(() => expect(getByTestId('comment-author-c1').props.children).toBe('Mehmet K.'));
});

// ── Role badge ────────────────────────────────────────────────────────────────

it('renders TrustedContributorBadge for TRUSTED_CONTRIBUTOR role', async () => {
  mockGetComments.mockResolvedValue([
    makeComment({ id: 'c1', author: { userId: 'u1', fullName: 'Trusted User', role: 'TRUSTED_CONTRIBUTOR', mobilityAidType: null } }),
  ]);
  const { getByTestId } = render(<DiscussionSection {...BASE_PROPS} />);
  await waitFor(() => expect(getByTestId('comment-badge-c1')).toBeTruthy());
});

it('does not render the badge for a regular user', async () => {
  mockGetComments.mockResolvedValue([
    makeComment({ id: 'c1', author: { userId: 'u1', fullName: 'Regular User', role: 'REGISTERED_USER', mobilityAidType: null } }),
  ]);
  const { queryByTestId } = render(<DiscussionSection {...BASE_PROPS} />);
  await waitFor(() => expect(queryByTestId('comment-badge-c1')).toBeNull());
});

// ── Mobility aid label ────────────────────────────────────────────────────────

it('renders mobility aid label when mobilityAidType is WHEELCHAIR', async () => {
  mockGetComments.mockResolvedValue([
    makeComment({ id: 'c1', author: { userId: 'u1', fullName: 'A', role: 'REGISTERED_USER', mobilityAidType: 'WHEELCHAIR' } }),
  ]);
  const { getByTestId } = render(<DiscussionSection {...BASE_PROPS} />);
  await waitFor(() => expect(getByTestId('comment-aid-c1').props.children).toBe('Wheelchair user'));
});

it('renders mobility aid label for ELECTRIC_WHEELCHAIR', async () => {
  mockGetComments.mockResolvedValue([
    makeComment({ id: 'c1', author: { userId: 'u1', fullName: 'A', role: 'REGISTERED_USER', mobilityAidType: 'ELECTRIC_WHEELCHAIR' } }),
  ]);
  const { getByTestId } = render(<DiscussionSection {...BASE_PROPS} />);
  await waitFor(() => expect(getByTestId('comment-aid-c1').props.children).toBe('Electric wheelchair user'));
});

it('does not render the mobility aid label when mobilityAidType is NONE', async () => {
  mockGetComments.mockResolvedValue([
    makeComment({ id: 'c1', author: { userId: 'u1', fullName: 'A', role: 'REGISTERED_USER', mobilityAidType: 'NONE' } }),
  ]);
  const { queryByTestId } = render(<DiscussionSection {...BASE_PROPS} />);
  await waitFor(() => expect(queryByTestId('comment-aid-c1')).toBeNull());
});

it('does not render the mobility aid label when mobilityAidType is null', async () => {
  mockGetComments.mockResolvedValue([
    makeComment({ id: 'c1', author: { userId: 'u1', fullName: 'A', role: 'REGISTERED_USER', mobilityAidType: null } }),
  ]);
  const { queryByTestId } = render(<DiscussionSection {...BASE_PROPS} />);
  await waitFor(() => expect(queryByTestId('comment-aid-c1')).toBeNull());
});

// ── Guest prompt ──────────────────────────────────────────────────────────────

it('shows the guest prompt and no input for guests', async () => {
  const { getByTestId, queryByTestId } = render(
    <DiscussionSection {...BASE_PROPS} currentUserId="" />,
  );
  await waitFor(() => {
    expect(getByTestId('discussion-guest-prompt')).toBeTruthy();
    expect(queryByTestId('discussion-input-row')).toBeNull();
  });
});

it('shows the input row and no guest prompt for logged-in users', async () => {
  const { getByTestId, queryByTestId } = render(<DiscussionSection {...BASE_PROPS} />);
  await waitFor(() => {
    expect(getByTestId('discussion-input-row')).toBeTruthy();
    expect(queryByTestId('discussion-guest-prompt')).toBeNull();
  });
});

// ── Post flow ─────────────────────────────────────────────────────────────────

it('calls postComment with the typed body on submit', async () => {
  const { getByTestId } = render(<DiscussionSection {...BASE_PROPS} />);
  await waitFor(() => getByTestId('comment-input'));

  fireEvent.changeText(getByTestId('comment-input'), 'Great report!');
  await act(async () => { fireEvent.press(getByTestId('comment-submit')); });

  expect(mockPostComment).toHaveBeenCalledWith('r1', 'Great report!');
});

it('appends the new comment to the list after successful post', async () => {
  mockPostComment.mockResolvedValue(makeComment({ id: 'c-new', body: 'My new comment' }));
  const { getByTestId } = render(<DiscussionSection {...BASE_PROPS} />);
  await waitFor(() => getByTestId('comment-input'));

  fireEvent.changeText(getByTestId('comment-input'), 'My new comment');
  await act(async () => { fireEvent.press(getByTestId('comment-submit')); });

  await waitFor(() => expect(getByTestId('comment-c-new')).toBeTruthy());
});

it('clears the input after successful post', async () => {
  const { getByTestId } = render(<DiscussionSection {...BASE_PROPS} />);
  await waitFor(() => getByTestId('comment-input'));

  fireEvent.changeText(getByTestId('comment-input'), 'Hello');
  await act(async () => { fireEvent.press(getByTestId('comment-submit')); });

  await waitFor(() => expect(getByTestId('comment-input').props.value).toBe(''));
});

it('does not call postComment when body is empty or whitespace', async () => {
  const { getByTestId } = render(<DiscussionSection {...BASE_PROPS} />);
  await waitFor(() => getByTestId('comment-input'));

  fireEvent.changeText(getByTestId('comment-input'), '   ');
  fireEvent.press(getByTestId('comment-submit'));

  expect(mockPostComment).not.toHaveBeenCalled();
});

it('does not call postComment twice on double-tap', async () => {
  let resolve!: (v: any) => void;
  mockPostComment.mockReturnValue(new Promise((r) => { resolve = r; }));
  const { getByTestId } = render(<DiscussionSection {...BASE_PROPS} />);
  await waitFor(() => getByTestId('comment-input'));

  fireEvent.changeText(getByTestId('comment-input'), 'Hello');
  await act(async () => {
    fireEvent.press(getByTestId('comment-submit'));
    fireEvent.press(getByTestId('comment-submit'));
  });

  expect(mockPostComment).toHaveBeenCalledTimes(1);
  await act(async () => { resolve(makeComment()); });
});
