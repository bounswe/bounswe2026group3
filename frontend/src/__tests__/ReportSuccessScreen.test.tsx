/**
 * Component tests for ReportSuccessScreen.
 *
 * Verifies correct rendering of report data and the
 * "Submit Another Report" callback.
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ReportSuccessScreen from '../components/reports/ReportSuccessScreen';
import type { SubmitReportResponse } from '../types/report';

const MOCK_REPORT: SubmitReportResponse = {
  reportId: 'abcd1234efgh5678',
  status: 'UNVERIFIED',
  autoVerified: false,
  duplicateCandidate: null,
  createdAt: '2026-04-03T10:00:00.000Z',
};

describe('ReportSuccessScreen', () => {
  it('renders the success heading', () => {
    const { getByText } = render(
      <ReportSuccessScreen report={MOCK_REPORT} onSubmitAnother={jest.fn()} />
    );
    expect(getByText('Report Received!')).toBeTruthy();
  });

  it('displays a truncated, uppercased report ID from the last 8 chars', () => {
    const { getByText } = render(
      <ReportSuccessScreen report={MOCK_REPORT} onSubmitAnother={jest.fn()} />
    );
    // 'abcd1234efgh5678'.slice(-8).toUpperCase() === 'EFGH5678'
    expect(getByText('#EFGH5678')).toBeTruthy();
  });

  it('shows the UNVERIFIED status badge', () => {
    const { getByText } = render(
      <ReportSuccessScreen report={MOCK_REPORT} onSubmitAnother={jest.fn()} />
    );
    expect(getByText('Unverified')).toBeTruthy();
  });

  it('shows autoVerified as No when false', () => {
    const { getByText } = render(
      <ReportSuccessScreen report={MOCK_REPORT} onSubmitAnother={jest.fn()} />
    );
    expect(getByText('No')).toBeTruthy();
  });

  it('shows autoVerified as Yes when true', () => {
    const { getByText } = render(
      <ReportSuccessScreen
        report={{ ...MOCK_REPORT, autoVerified: true }}
        onSubmitAnother={jest.fn()}
      />
    );
    expect(getByText('Yes')).toBeTruthy();
  });

  it('calls onSubmitAnother when the CTA button is pressed', () => {
    const onSubmitAnother = jest.fn();
    const { getByText } = render(
      <ReportSuccessScreen report={MOCK_REPORT} onSubmitAnother={onSubmitAnother} />
    );
    fireEvent.press(getByText('Submit Another Report'));
    expect(onSubmitAnother).toHaveBeenCalledTimes(1);
  });

  it('renders the submission summary section', () => {
    const { getByText } = render(
      <ReportSuccessScreen report={MOCK_REPORT} onSubmitAnother={jest.fn()} />
    );
    expect(getByText('Submission Summary')).toBeTruthy();
    expect(getByText('Report ID')).toBeTruthy();
    expect(getByText('Status')).toBeTruthy();
  });
});
