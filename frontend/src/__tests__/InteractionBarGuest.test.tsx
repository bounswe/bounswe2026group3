/**
 * Tests for Issue #90 AC #3:
 * "Upvote and flag buttons are not rendered for guests."
 *
 * The buttons must be completely absent from the tree (not just disabled)
 * when isLoggedIn() returns false.
 *
 * Mocking pattern follows TrustedContributorBadge.test.tsx — the auth
 * service is mocked at the module level so isLoggedIn() can be controlled
 * per test.
 */

import React from 'react';
import { render } from '@testing-library/react-native';

jest.mock('../services/auth', () => ({
  __esModule: true,
  isLoggedIn: jest.fn(),
}));

import InteractionBar from '../components/reports/InteractionBar';
import * as authService from '../services/auth';

const mockIsLoggedIn = authService.isLoggedIn as jest.MockedFunction<
  typeof authService.isLoggedIn
>;

const baseProps = {
  reportId: 'r1',
  reporterId: 'someone-else',
  upvoteCount: 3,
  flagCount: 1,
  userUpvoted: false,
  userFlagged: false,
  // Non-empty so we don't trip the legacy isGuest=='' branch in callbacks —
  // guest gating is now driven entirely by isLoggedIn().
  currentUserId: 'viewer-1',
  onUpdate: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('InteractionBar — guest gating (Issue #90 AC #3)', () => {
  it('does NOT render upvote or flag buttons when isLoggedIn() is false', () => {
    mockIsLoggedIn.mockReturnValue(false);

    const { queryByTestId } = render(<InteractionBar {...baseProps} />);

    expect(queryByTestId('upvote-button')).toBeNull();
    expect(queryByTestId('flag-button')).toBeNull();
  });

  it('renders both upvote and flag buttons when isLoggedIn() is true', () => {
    mockIsLoggedIn.mockReturnValue(true);

    const { getByTestId } = render(<InteractionBar {...baseProps} />);

    expect(getByTestId('upvote-button')).toBeTruthy();
    expect(getByTestId('flag-button')).toBeTruthy();
  });
});
