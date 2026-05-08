import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import AuthorityDashboardScreen from '../../app/authority/dashboard';
import * as authorityApi from '../api/authority';
import * as auth from '../services/auth';

jest.mock('../api/authority');
jest.mock('../services/auth');
jest.mock('@expo/vector-icons', () => ({
  Ionicons: () => null,
}));

const mockRouter = { replace: jest.fn(), push: jest.fn() };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useFocusEffect: (cb: () => void) => {
    const React = require('react');
    React.useEffect(() => {
      cb();
    }, []);
  },
}));

const mockFetch = authorityApi.fetchAuthorityDashboard as jest.MockedFunction<
  typeof authorityApi.fetchAuthorityDashboard
>;
const mockClearTokens = auth.clearTokens as jest.MockedFunction<typeof auth.clearTokens>;

function makeReport(overrides: Partial<authorityApi.DashboardReport> = {}): authorityApi.DashboardReport {
  return {
    reportId: 'r1',
    title: 'Broken Ramp',
    description: 'Concrete crumbling at corner.',
    category: 'BROKEN_RAMP',
    context: 'OUTDOOR',
    status: 'VERIFIED',
    location: { lat: 41.0837, lng: 29.051 },
    upvoteCount: 4,
    thumbnailUrl: null,
    reporter: { userId: 'u1', fullName: 'Aylin Y.' },
    createdAt: '2026-04-30T10:00:00Z',
    updatedAt: '2026-04-30T10:00:00Z',
    ...overrides,
  };
}

const BASE_RESPONSE: authorityApi.DashboardResponse = {
  reports: [makeReport()],
  pagination: { page: 1, size: 20, totalItems: 1 },
  counts: { verified: 5, awaitingValidation: 2, closed: 7, total: 14 },
};

beforeEach(() => {
  jest.clearAllMocks();
  mockFetch.mockResolvedValue({ ok: true, status: 200, data: BASE_RESPONSE });
});

it('renders the counts strip from the API response', async () => {
  const { findByTestId, findAllByText } = render(<AuthorityDashboardScreen />);
  const strip = await findByTestId('counts-strip');
  expect(strip).toBeTruthy();
  // Both the strip and the corresponding filter chip render the same number,
  // so we look at the strip's labels and each numeric appears at least once.
  const fives = await findAllByText('5');
  const twos = await findAllByText('2');
  const sevens = await findAllByText('7');
  expect(fives.length).toBeGreaterThan(0);
  expect(twos.length).toBeGreaterThan(0);
  expect(sevens.length).toBeGreaterThan(0);
});

it('renders a row per report returned by the dashboard endpoint', async () => {
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    data: {
      ...BASE_RESPONSE,
      reports: [makeReport({ reportId: 'a' }), makeReport({ reportId: 'b' })],
    },
  });
  const { findByTestId } = render(<AuthorityDashboardScreen />);
  expect(await findByTestId('report-card-a')).toBeTruthy();
  expect(await findByTestId('report-card-b')).toBeTruthy();
});

it('shows the empty state when there are no reports for the current filter', async () => {
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    data: { ...BASE_RESPONSE, reports: [] },
  });
  const { findByTestId } = render(<AuthorityDashboardScreen />);
  expect(await findByTestId('dashboard-empty')).toBeTruthy();
});

it('defaults to the VERIFIED filter on first load', async () => {
  render(<AuthorityDashboardScreen />);
  await waitFor(() => {
    expect(mockFetch).toHaveBeenCalledWith({ status: 'VERIFIED' });
  });
});

it('refetches with the new status when a filter chip is tapped', async () => {
  const { getByTestId } = render(<AuthorityDashboardScreen />);
  await waitFor(() => expect(mockFetch).toHaveBeenCalled());

  await act(async () => {
    fireEvent.press(getByTestId('filter-RESOLVED_AWAITING_VALIDATION'));
  });

  await waitFor(() => {
    expect(mockFetch).toHaveBeenCalledWith({ status: 'RESOLVED_AWAITING_VALIDATION' });
  });
});

it('passes status: null to the API when the All chip is tapped', async () => {
  const { getByTestId } = render(<AuthorityDashboardScreen />);
  await waitFor(() => expect(mockFetch).toHaveBeenCalled());

  await act(async () => {
    fireEvent.press(getByTestId('filter-ALL'));
  });

  await waitFor(() => {
    expect(mockFetch).toHaveBeenCalledWith({ status: null });
  });
});

it('opens the report detail screen on row tap', async () => {
  const { findByTestId } = render(<AuthorityDashboardScreen />);
  const card = await findByTestId('report-card-r1');

  await act(async () => {
    fireEvent.press(card);
  });

  expect(mockRouter.push).toHaveBeenCalledWith('/authority/report/r1');
});

it('shows an error banner if the dashboard endpoint fails', async () => {
  mockFetch.mockResolvedValue({ ok: false, status: 500, data: { detail: 'boom' } });
  const { findByTestId } = render(<AuthorityDashboardScreen />);
  expect(await findByTestId('dashboard-error')).toBeTruthy();
});

it('redirects to login when the dashboard returns 401', async () => {
  mockFetch.mockResolvedValue({ ok: false, status: 401, data: { detail: 'unauthorized' } });
  render(<AuthorityDashboardScreen />);
  await waitFor(() => {
    expect(mockClearTokens).toHaveBeenCalled();
    expect(mockRouter.replace).toHaveBeenCalledWith('/auth/login');
  });
});
