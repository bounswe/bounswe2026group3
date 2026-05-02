/**
 * Tests for TrustedContributorBadge + its integration on the Profile screen.
 *
 * Covers:
 *   - Badge visible when role === 'TRUSTED_CONTRIBUTOR'
 *   - Badge absent when role is anything else
 *   - Trust Score number renders correctly
 *
 * react-native-svg is mocked so tests don't need the native module.
 */

import React from 'react';
import { render, waitFor } from '@testing-library/react-native';

// ── Mock react-native-svg with simple RN primitives ─────────────────────────
jest.mock('react-native-svg', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Stub = (name: string) => {
    const C = ({ children, ...rest }: any) =>
      React.createElement(View, { ...rest, testID: rest.testID }, children);
    C.displayName = name;
    return C;
  };
  return {
    __esModule: true,
    default: Stub('Svg'),
    Svg: Stub('Svg'),
    Path: Stub('Path'),
    Circle: Stub('Circle'),
    Rect: Stub('Rect'),
    G: Stub('G'),
    Defs: Stub('Defs'),
    LinearGradient: Stub('LinearGradient'),
    Stop: Stub('Stop'),
  };
});

// ── Mock services consumed by the Profile screen ────────────────────────────
jest.mock('../services/auth', () => ({
  __esModule: true,
  isLoggedIn: () => true,
  clearTokens: jest.fn(),
  parseDRFError: (e: any) => String(e),
  getMe: jest.fn(),
  updateMe: jest.fn(),
}));

jest.mock('../api/savedPlaces', () => ({
  __esModule: true,
  getSavedPlaces: jest.fn().mockResolvedValue([]),
  deleteSavedPlace: jest.fn(),
}));

jest.mock('../components/profile/MobilityProfileCard', () => ({
  __esModule: true,
  MobilityProfileCard: () => null,
}));

jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
}));

import { TrustedContributorBadge } from '../components/profile/TrustedContributorBadge';
import * as authService from '../services/auth';
import ProfileScreen from '../../app/tabs/profile';

const mockGetMe = authService.getMe as jest.MockedFunction<typeof authService.getMe>;

function makeUser(overrides: Partial<any> = {}) {
  return {
    userId: 'u1',
    email: 'jane@example.com',
    fullName: 'Jane Doe',
    status: 'ACTIVE',
    trustScore: 42,
    role: 'USER',
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ── Standalone component ────────────────────────────────────────────────────
describe('TrustedContributorBadge (standalone)', () => {
  it('renders the SVG icon and the label', () => {
    const { getByTestId, getByText } = render(<TrustedContributorBadge />);
    expect(getByTestId('trusted-contributor-badge')).toBeTruthy();
    expect(getByTestId('trusted-contributor-badge-svg')).toBeTruthy();
    expect(getByText('Trusted Contributor')).toBeTruthy();
  });

  it('honors a custom testID prop', () => {
    const { getByTestId } = render(<TrustedContributorBadge testID="custom-tcb" />);
    expect(getByTestId('custom-tcb')).toBeTruthy();
    expect(getByTestId('custom-tcb-svg')).toBeTruthy();
  });
});

// ── Integration with the profile screen ─────────────────────────────────────
describe('Profile screen — Trusted Contributor badge & Trust Score', () => {
  it('renders the badge when role === "TRUSTED_CONTRIBUTOR"', async () => {
    mockGetMe.mockResolvedValue({
      ok: true,
      status: 200,
      data: makeUser({ role: 'TRUSTED_CONTRIBUTOR' }),
    } as any);

    const { findByTestId } = render(<ProfileScreen />);
    expect(await findByTestId('trusted-contributor-badge')).toBeTruthy();
  });

  it('does NOT render the badge when role is "USER"', async () => {
    mockGetMe.mockResolvedValue({
      ok: true,
      status: 200,
      data: makeUser({ role: 'USER' }),
    } as any);

    const { queryByTestId, findByTestId } = render(<ProfileScreen />);
    // Wait for the screen to finish loading (trust score renders after fetch)
    await findByTestId('trust-score-value');
    expect(queryByTestId('trusted-contributor-badge')).toBeNull();
  });

  it('does NOT render the badge for unrelated roles (e.g. "ADMIN")', async () => {
    mockGetMe.mockResolvedValue({
      ok: true,
      status: 200,
      data: makeUser({ role: 'ADMIN' }),
    } as any);

    const { queryByTestId, findByTestId } = render(<ProfileScreen />);
    await findByTestId('trust-score-value');
    expect(queryByTestId('trusted-contributor-badge')).toBeNull();
  });

  it('renders the Trust Score numerical value from /users/me', async () => {
    mockGetMe.mockResolvedValue({
      ok: true,
      status: 200,
      data: makeUser({ trustScore: 137 }),
    } as any);

    const { findByTestId } = render(<ProfileScreen />);
    const node = await findByTestId('trust-score-value');
    expect(node.props.children).toBe(137);
  });

  it('falls back to 0 when trustScore is missing', async () => {
    mockGetMe.mockResolvedValue({
      ok: true,
      status: 200,
      data: makeUser({ trustScore: undefined }),
    } as any);

    const { findByTestId } = render(<ProfileScreen />);
    const node = await findByTestId('trust-score-value');
    expect(node.props.children).toBe(0);
  });
});
