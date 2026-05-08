import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import AuthorityLayout from '../../app/authority/_layout';
import * as auth from '../services/auth';

jest.mock('../services/auth');
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

const mockRouter = { replace: jest.fn(), push: jest.fn() };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  Stack: Object.assign(
    ({ children }: any) => children ?? null,
    { Screen: () => null },
  ),
}));

const mockIsLoggedIn = auth.isLoggedIn as jest.MockedFunction<typeof auth.isLoggedIn>;
const mockGetMe = auth.getMe as jest.MockedFunction<typeof auth.getMe>;
const mockClearTokens = auth.clearTokens as jest.MockedFunction<typeof auth.clearTokens>;
const mockIsAuthorityRole = auth.isAuthorityRole as jest.MockedFunction<typeof auth.isAuthorityRole>;

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
  mockIsAuthorityRole.mockImplementation((r) => r === 'INFRASTRUCTURE_AUTHORITY');
});

it('redirects to /auth/login when not logged in', async () => {
  mockIsLoggedIn.mockReturnValue(false);
  render(<AuthorityLayout />);
  await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/auth/login'));
});

it('redirects a logged-in non-authority user to /tabs', async () => {
  mockIsLoggedIn.mockReturnValue(true);
  mockGetMe.mockResolvedValue(ME('REGISTERED_USER'));
  render(<AuthorityLayout />);
  await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/tabs'));
});

it('clears tokens and redirects to login when getMe returns 401', async () => {
  mockIsLoggedIn.mockReturnValue(true);
  mockGetMe.mockResolvedValue({ ok: false as const, status: 401, data: {} as any });
  render(<AuthorityLayout />);
  await waitFor(() => {
    expect(mockClearTokens).toHaveBeenCalled();
    expect(mockRouter.replace).toHaveBeenCalledWith('/auth/login');
  });
});

it('does NOT redirect when the user has the infrastructure authority role', async () => {
  mockIsLoggedIn.mockReturnValue(true);
  mockGetMe.mockResolvedValue(ME('INFRASTRUCTURE_AUTHORITY'));
  render(<AuthorityLayout />);
  await waitFor(() => expect(mockGetMe).toHaveBeenCalled());
  // No redirect call should occur for an authority user.
  expect(mockRouter.replace).not.toHaveBeenCalled();
});

it('shows a loading indicator while the role check is pending', async () => {
  mockIsLoggedIn.mockReturnValue(true);
  // Never resolves during the test — the guard stays in checking phase.
  mockGetMe.mockImplementation(() => new Promise(() => {}));
  const { getByTestId } = render(<AuthorityLayout />);
  expect(getByTestId('authority-guard-loading')).toBeTruthy();
});
