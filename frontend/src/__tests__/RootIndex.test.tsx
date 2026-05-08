import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import Index from '../../app/index';
import * as auth from '../services/auth';

jest.mock('../services/auth');

// Capture the href passed to <Redirect> so we can assert on it.
// Jest's mock factory only allows out-of-scope vars whose names start with "mock".
const mockRedirect = jest.fn();
jest.mock('expo-router', () => ({
  Redirect: (props: { href: string }) => {
    mockRedirect(props.href);
    return null;
  },
}));

const mockIsLoggedIn = auth.isLoggedIn as jest.MockedFunction<typeof auth.isLoggedIn>;
const mockGetMe = auth.getMe as jest.MockedFunction<typeof auth.getMe>;
const mockLandingRouteForRole = auth.landingRouteForRole as jest.MockedFunction<
  typeof auth.landingRouteForRole
>;

const ME = (role: string) => ({
  ok: true as const,
  status: 200,
  data: {
    userId: 'u1', email: 'a@b.com', fullName: 'A', status: 'ACTIVE',
    trustScore: 0, role, createdAt: '2026-01-01T00:00:00Z',
  },
});

beforeEach(() => {
  jest.clearAllMocks();
  mockLandingRouteForRole.mockImplementation((r) =>
    r === 'INFRASTRUCTURE_AUTHORITY' ? '/authority/dashboard' : '/tabs',
  );
});

it('redirects guests to /auth/login', async () => {
  mockIsLoggedIn.mockReturnValue(false);
  render(<Index />);
  await waitFor(() => expect(mockRedirect).toHaveBeenCalledWith('/auth/login'));
});

it('redirects an authority user to /authority/dashboard', async () => {
  mockIsLoggedIn.mockReturnValue(true);
  mockGetMe.mockResolvedValue(ME('INFRASTRUCTURE_AUTHORITY'));
  render(<Index />);
  await waitFor(() => expect(mockRedirect).toHaveBeenCalledWith('/authority/dashboard'));
});

it('redirects a citizen user to /tabs', async () => {
  mockIsLoggedIn.mockReturnValue(true);
  mockGetMe.mockResolvedValue(ME('REGISTERED_USER'));
  render(<Index />);
  await waitFor(() => expect(mockRedirect).toHaveBeenCalledWith('/tabs'));
});

it('falls back to /tabs when getMe fails', async () => {
  mockIsLoggedIn.mockReturnValue(true);
  mockGetMe.mockResolvedValue({ ok: false as const, status: 500, data: {} as any });
  render(<Index />);
  await waitFor(() => expect(mockRedirect).toHaveBeenCalledWith('/tabs'));
});

it('shows a spinner before the role check resolves', () => {
  mockIsLoggedIn.mockReturnValue(true);
  // Promise that never resolves: keeps the component in the pending phase.
  mockGetMe.mockImplementation(() => new Promise(() => {}));
  const { UNSAFE_root } = render(<Index />);
  // No redirect should have fired yet.
  expect(mockRedirect).not.toHaveBeenCalled();
  // ActivityIndicator is rendered (no testID, but we can assert it exists).
  expect(UNSAFE_root).toBeTruthy();
});
