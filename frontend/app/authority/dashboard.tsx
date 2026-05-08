import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../src/constants/theme';
import { clearTokens } from '../../src/services/auth';
import {
  fetchAuthorityDashboard,
  type DashboardCounts,
  type DashboardReport,
} from '../../src/api/authority';
import StatusFilterChips, { type FilterValue } from '../../src/components/authority/StatusFilterChips';
import ReportListItem from '../../src/components/authority/ReportListItem';

const EMPTY_COUNTS: DashboardCounts = { verified: 0, awaitingValidation: 0, closed: 0, total: 0 };

export default function AuthorityDashboardScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterValue>('VERIFIED');
  const [reports, setReports] = useState<DashboardReport[]>([]);
  const [counts, setCounts] = useState<DashboardCounts>(EMPTY_COUNTS);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const load = useCallback(async (currentFilter: FilterValue) => {
    setErrorMsg('');
    const res = await fetchAuthorityDashboard({
      status: currentFilter === 'ALL' ? null : currentFilter,
    });
    if (res.ok) {
      const data = res.data as { reports: DashboardReport[]; counts: DashboardCounts };
      setReports(data.reports);
      setCounts(data.counts);
    } else if (res.status === 401) {
      clearTokens();
      router.replace('/auth/login');
    } else {
      setErrorMsg('Could not load reports.');
    }
  }, [router]);

  useEffect(() => {
    setLoading(true);
    load(filter).finally(() => setLoading(false));
  }, [filter, load]);

  // Refresh when navigating back from a resolve action.
  useFocusEffect(
    useCallback(() => {
      load(filter);
    }, [filter, load]),
  );

  async function handleRefresh() {
    setRefreshing(true);
    await load(filter);
    setRefreshing(false);
  }

  function handleSignOut() {
    clearTokens();
    router.replace('/auth/login');
  }

  function openReport(report: DashboardReport) {
    router.push(`/authority/report/${report.reportId}` as any);
  }

  return (
    <View style={s.page}>
      <View style={s.summaryStrip} testID="counts-strip">
        <View style={s.summaryCell}>
          <Text style={[s.summaryNum, { color: COLORS.green700 }]}>{counts.verified}</Text>
          <Text style={s.summaryLabel}>Verified</Text>
        </View>
        <View style={s.summaryDivider} />
        <View style={s.summaryCell}>
          <Text style={[s.summaryNum, { color: COLORS.orange500 }]}>{counts.awaitingValidation}</Text>
          <Text style={s.summaryLabel}>Awaiting</Text>
        </View>
        <View style={s.summaryDivider} />
        <View style={s.summaryCell}>
          <Text style={[s.summaryNum, { color: COLORS.gray500 }]}>{counts.closed}</Text>
          <Text style={s.summaryLabel}>Closed</Text>
        </View>
        <TouchableOpacity onPress={handleSignOut} style={s.signOutBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Ionicons name="log-out-outline" size={18} color={COLORS.gray500} />
        </TouchableOpacity>
      </View>

      <StatusFilterChips value={filter} onChange={setFilter} counts={counts} />

      {loading ? (
        <View style={s.center}><ActivityIndicator size="large" color={COLORS.green700} /></View>
      ) : (
        <ScrollView
          style={s.list}
          contentContainerStyle={s.listContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.green700} />}
        >
          {!!errorMsg && (
            <View style={s.errBanner} testID="dashboard-error">
              <Ionicons name="alert-circle-outline" size={16} color={COLORS.red600} />
              <Text style={s.errText}>{errorMsg}</Text>
            </View>
          )}

          {reports.length === 0 ? (
            <View style={s.empty} testID="dashboard-empty">
              <Ionicons name="checkmark-done-outline" size={48} color={COLORS.gray300} />
              <Text style={s.emptyTitle}>Nothing here</Text>
              <Text style={s.emptySub}>
                {filter === 'VERIFIED'
                  ? 'No verified reports waiting for repair.'
                  : filter === 'RESOLVED_AWAITING_VALIDATION'
                  ? 'No reports awaiting citizen validation.'
                  : filter === 'CLOSED'
                  ? 'No closed reports yet.'
                  : 'No reports for this filter.'}
              </Text>
            </View>
          ) : (
            reports.map((r) => (
              <ReportListItem key={r.reportId} report={r} onPress={openReport} />
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLORS.gray100 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  summaryStrip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.white,
    paddingVertical: 14, paddingHorizontal: 14,
    borderBottomWidth: 1, borderBottomColor: COLORS.gray200,
  },
  summaryCell: { flex: 1, alignItems: 'center' },
  summaryNum: { fontSize: 22, fontWeight: '800' },
  summaryLabel: { fontSize: 11, color: COLORS.gray500, fontWeight: '600', marginTop: 2 },
  summaryDivider: { width: 1, height: 28, backgroundColor: COLORS.gray200 },
  signOutBtn: { paddingLeft: 12 },
  list: { flex: 1 },
  listContent: { padding: 14, paddingBottom: 32 },
  empty: { alignItems: 'center', paddingVertical: 60, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: COLORS.gray500, marginTop: 6 },
  emptySub: { fontSize: 13, color: COLORS.gray400, textAlign: 'center', paddingHorizontal: 20 },
  errBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.red50, padding: 12, borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.15)', marginBottom: 12,
  },
  errText: { fontSize: 13, color: COLORS.red600, fontWeight: '500', flex: 1 },
});
