import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import ReportForm from '../../src/components/reports/ReportForm';
import ReportSuccessScreen from '../../src/components/reports/ReportSuccessScreen';
import type { SubmitReportResponse } from '../../src/types/report';
import { isLoggedIn } from '../../src/services/auth';
import { COLORS } from '../../src/constants/theme';

type Screen = 'form' | 'success';

export default function ReportScreen() {
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>('form');
  const [lastReport, setLastReport] = useState<SubmitReportResponse | null>(null);

  if (!isLoggedIn()) {
    return (
      <View style={s.wrap}>
        <Ionicons name="flag-outline" size={52} color={COLORS.gray300} />
        <Text style={s.title}>Sign in to report</Text>
        <Text style={s.body}>
          You need an account to submit obstacle reports and help your community.
        </Text>
        <TouchableOpacity style={s.primaryBtn} onPress={() => router.push('/auth/login')}>
          <Text style={s.primaryBtnText}>Sign in</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.secondaryBtn} onPress={() => router.push('/auth/register')}>
          <Text style={s.secondaryBtnText}>Create account</Text>
        </TouchableOpacity>
      </View>
    );
  }

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

const s = StyleSheet.create({
  wrap: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 32, gap: 12, backgroundColor: COLORS.gray100,
  },
  title: { fontSize: 20, fontWeight: '800', color: COLORS.gray900, marginTop: 8 },
  body: { fontSize: 14, color: COLORS.gray500, textAlign: 'center', lineHeight: 20, marginBottom: 8 },
  primaryBtn: {
    width: '100%', height: 48, borderRadius: 12,
    backgroundColor: COLORS.green700, alignItems: 'center', justifyContent: 'center',
  },
  primaryBtnText: { color: COLORS.white, fontSize: 15, fontWeight: '700' },
  secondaryBtn: {
    width: '100%', height: 48, borderRadius: 12,
    borderWidth: 1.5, borderColor: COLORS.gray300,
    backgroundColor: COLORS.white, alignItems: 'center', justifyContent: 'center',
  },
  secondaryBtnText: { color: COLORS.gray700, fontSize: 15, fontWeight: '600' },
});
