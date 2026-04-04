import { useState } from 'react';
import ReportForm from '../../src/components/reports/ReportForm';
import ReportSuccessScreen from '../../src/components/reports/ReportSuccessScreen';
import type { SubmitReportResponse } from '../../src/types/report';

type Screen = 'form' | 'success';

export default function ReportScreen() {
  const [screen, setScreen] = useState<Screen>('form');
  const [lastReport, setLastReport] = useState<SubmitReportResponse | null>(null);

  if (screen === 'success' && lastReport) {
    return (
      <ReportSuccessScreen
        report={lastReport}
        onSubmitAnother={() => { setLastReport(null); setScreen('form'); }}
      />
    );
  }

  return (
    <ReportForm
      onSuccess={r => { setLastReport(r); setScreen('success'); }}
    />
  );
}
