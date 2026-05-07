import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import NotificationsScreen from '../../app/tabs/notifications';
import * as auth from '../services/auth';
import * as notificationsApi from '../api/notifications';

jest.mock('../services/auth');
jest.mock('../api/notifications');
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
}));
jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

const mockRouter = { replace: jest.fn(), push: jest.fn() };

const mockIsLoggedIn = auth.isLoggedIn as jest.MockedFunction<typeof auth.isLoggedIn>;
const mockGetMe = auth.getMe as jest.MockedFunction<typeof auth.getMe>;
const mockGetNotifications = notificationsApi.getNotifications as jest.MockedFunction<typeof notificationsApi.getNotifications>;
const mockMarkNotificationRead = notificationsApi.markNotificationRead as jest.MockedFunction<typeof notificationsApi.markNotificationRead>;

const BASE_ME = {
  ok: true as const,
  status: 200,
  data: {
    userId: 'u1',
    email: 'test@example.com',
    fullName: 'Test User',
    status: 'ACTIVE',
    trustScore: 10,
    role: 'USER' as const,
    createdAt: '2026-01-01T00:00:00Z',
    notificationsEnabled: true,
  },
};

const MOCK_NOTIFICATIONS: notificationsApi.Notification[] = [
  { id: 'n1', message: 'Your report was verified', reportId: 'r1', isRead: false, createdAt: new Date().toISOString() },
  { id: 'n2', message: 'Your report was closed', reportId: 'r2', isRead: true, createdAt: new Date().toISOString() },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockIsLoggedIn.mockReturnValue(true);
  mockGetMe.mockResolvedValue(BASE_ME);
  mockGetNotifications.mockResolvedValue([]);
  mockMarkNotificationRead.mockResolvedValue(true);
});

// ── Auth guard ────────────────────────────────────────────────────────────────

it('redirects to login when user is not logged in', async () => {
  mockIsLoggedIn.mockReturnValue(false);
  render(<NotificationsScreen />);
  await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/auth/login'));
});

// ── Empty state ───────────────────────────────────────────────────────────────

it('shows empty state when there are no notifications', async () => {
  const { getByTestId } = render(<NotificationsScreen />);
  await waitFor(() => expect(getByTestId('notifications-empty')).toBeTruthy());
});

// ── Disabled state ────────────────────────────────────────────────────────────

it('shows disabled banner when notificationsEnabled is false', async () => {
  mockGetMe.mockResolvedValue({ ...BASE_ME, data: { ...BASE_ME.data, notificationsEnabled: false } });
  const { getByTestId } = render(<NotificationsScreen />);
  await waitFor(() => expect(getByTestId('notifications-disabled')).toBeTruthy());
});

it('does not show the list when notifications are disabled', async () => {
  mockGetMe.mockResolvedValue({ ...BASE_ME, data: { ...BASE_ME.data, notificationsEnabled: false } });
  mockGetNotifications.mockResolvedValue(MOCK_NOTIFICATIONS);
  const { queryByTestId } = render(<NotificationsScreen />);
  await waitFor(() => expect(queryByTestId('notification-item-n1')).toBeNull());
});

// ── List rendering ────────────────────────────────────────────────────────────

it('renders a row for each notification', async () => {
  mockGetNotifications.mockResolvedValue(MOCK_NOTIFICATIONS);
  const { getByTestId } = render(<NotificationsScreen />);
  await waitFor(() => {
    expect(getByTestId('notification-item-n1')).toBeTruthy();
    expect(getByTestId('notification-item-n2')).toBeTruthy();
  });
});

it('renders notification message text', async () => {
  mockGetNotifications.mockResolvedValue(MOCK_NOTIFICATIONS);
  const { getByText } = render(<NotificationsScreen />);
  await waitFor(() => {
    expect(getByText('Your report was verified')).toBeTruthy();
    expect(getByText('Your report was closed')).toBeTruthy();
  });
});

// ── Tap behavior ──────────────────────────────────────────────────────────────

it('calls markNotificationRead when tapping an unread notification', async () => {
  mockGetNotifications.mockResolvedValue(MOCK_NOTIFICATIONS);
  const { getByTestId } = render(<NotificationsScreen />);
  await waitFor(() => getByTestId('notification-item-n1'));

  await act(async () => {
    fireEvent.press(getByTestId('notification-item-n1'));
  });

  expect(mockMarkNotificationRead).toHaveBeenCalledWith('n1');
});

it('does not call markNotificationRead when tapping an already-read notification', async () => {
  mockGetNotifications.mockResolvedValue(MOCK_NOTIFICATIONS);
  const { getByTestId } = render(<NotificationsScreen />);
  await waitFor(() => getByTestId('notification-item-n2'));

  await act(async () => {
    fireEvent.press(getByTestId('notification-item-n2'));
  });

  expect(mockMarkNotificationRead).not.toHaveBeenCalled();
});

it('navigates to report detail when tapping a notification with a reportId', async () => {
  mockGetNotifications.mockResolvedValue(MOCK_NOTIFICATIONS);
  const { getByTestId } = render(<NotificationsScreen />);
  await waitFor(() => getByTestId('notification-item-n1'));

  await act(async () => {
    fireEvent.press(getByTestId('notification-item-n1'));
  });

  expect(mockRouter.push).toHaveBeenCalledWith('/report/r1');
});

it('optimistically marks notification as read in the UI after successful API call', async () => {
  mockGetNotifications.mockResolvedValue(MOCK_NOTIFICATIONS);
  const { getByTestId } = render(<NotificationsScreen />);
  await waitFor(() => getByTestId('notification-item-n1'));

  await act(async () => {
    fireEvent.press(getByTestId('notification-item-n1'));
  });

  await waitFor(() => {
    const item = getByTestId('notification-item-n1');
    // After marking read, itemUnread style (green background) should be gone
    const style = item.props.style;
    const flatStyle = Array.isArray(style) ? Object.assign({}, ...style.filter(Boolean)) : style;
    expect(flatStyle.backgroundColor).not.toBe('#f0faf4');
  });
});
