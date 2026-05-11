import React from 'react';
import { render } from '@testing-library/react-native';
import InteractionBar from '../components/reports/InteractionBar';

jest.mock('../api/interactions');

const baseProps = {
  reportId: 'r1',
  reporterId: 'someone-else',
  status: 'VERIFIED',
  upvoteCount: 3,
  upvoteThreshold: 5,
  flagCount: 1,
  userUpvoted: false,
  userFlagged: false,
  onUpdate: jest.fn(),
};

describe('InteractionBar — guest gating (Issue #90 AC #3)', () => {
  it('shows read-only counts but no interactive buttons for guests', () => {
    const { queryByTestId, getByTestId } = render(
      <InteractionBar {...baseProps} currentUserId="" />,
    );

    expect(queryByTestId('upvote-button')).toBeNull();
    expect(queryByTestId('flag-button')).toBeNull();
    expect(getByTestId('upvote-count')).toBeTruthy();
    expect(getByTestId('flag-count')).toBeTruthy();
  });

  it('displays the correct counts in guest read-only view', () => {
    const { getByTestId } = render(
      <InteractionBar {...baseProps} currentUserId="" upvoteCount={7} flagCount={2} />,
    );

    expect(getByTestId('upvote-count').props.children).toBe(7);
    expect(getByTestId('flag-count').props.children).toBe(2);
  });

  it('renders both upvote and flag buttons when logged in', () => {
    const { getByTestId } = render(
      <InteractionBar {...baseProps} currentUserId="user-789" />,
    );

    expect(getByTestId('upvote-button')).toBeTruthy();
    expect(getByTestId('flag-button')).toBeTruthy();
  });
});
