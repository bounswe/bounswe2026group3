import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/theme';
import type { SubmitReportResponse } from '../../types/report';

interface Props {
  report: SubmitReportResponse;
  onSubmitAnother: () => void;
}

interface RowProps { label: string; value: string; badge?: boolean; }

function Row({ label, value, badge }: RowProps) {
  return (
    <View style={r.row}>
      <Text style={r.label}>{label}</Text>
      {badge ? (
        <View style={r.badge}><Text style={r.badgeText}>{value}</Text></View>
      ) : (
        <Text style={r.value}>{value}</Text>
      )}
    </View>
  );
}

export default function ReportSuccessScreen({ report, onSubmitAnother }: Props) {
  const shortId = `#${report.reportId.slice(-8).toUpperCase()}`;

  return (
    <ScrollView style={s.page} contentContainerStyle={s.scroll}>
      <View style={s.iconWrap}>
        <Ionicons name="checkmark-circle" size={80} color={COLORS.green600} />
      </View>

      <Text style={s.heading}>Report Received!</Text>
      <Text style={s.sub}>
        Your report has been submitted successfully. A warning marker will be placed on the map for other users.
      </Text>

      <View style={s.card}>
        <View style={s.cardTitleRow}>
          <Ionicons name="document-text-outline" size={16} color={COLORS.green600} />
          <Text style={s.cardTitle}>Submission Summary</Text>
        </View>
        <Row label="Report ID" value={shortId} />
        <Row label="Status" value="Unverified" badge />
        <Row label="Auto-verified" value={report.autoVerified ? 'Yes' : 'No'} />
      </View>

      <View style={s.noteRow}>
        <Ionicons name="information-circle-outline" size={16} color={COLORS.gray400} />
        <Text style={s.note}>
          Other users can now upvote this report to verify it.
        </Text>
      </View>

      <TouchableOpacity style={s.btn} onPress={onSubmitAnother} activeOpacity={0.8}>
        <Ionicons name="add-circle-outline" size={18} color={COLORS.white} />
        <Text style={s.btnText}>Submit Another Report</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page:         { flex: 1, backgroundColor: COLORS.gray100 },
  scroll:       { paddingTop: 40, paddingHorizontal: 14 },
  iconWrap:     { alignItems: 'center' as const, marginBottom: 16 },
  heading:      { fontSize: 26, fontWeight: '800', color: COLORS.gray900, textAlign: 'center' as const, marginBottom: 10 },
  sub:          { fontSize: 14, color: COLORS.gray500, textAlign: 'center' as const, lineHeight: 22, marginBottom: 24 },
  card:         { backgroundColor: COLORS.white, borderRadius: 14, borderWidth: 1, borderColor: COLORS.gray200, padding: 16, marginBottom: 14 },
  cardTitleRow: { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, marginBottom: 12 },
  cardTitle:    { fontSize: 14, fontWeight: '700', color: COLORS.gray800 },
  noteRow:      { flexDirection: 'row' as const, alignItems: 'flex-start' as const, gap: 8, marginBottom: 28 },
  note:         { fontSize: 12, color: COLORS.gray400, lineHeight: 18, flex: 1 },
  btn:          { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 8, backgroundColor: COLORS.blue600, paddingVertical: 16, borderRadius: 12 },
  btnText:      { color: COLORS.white, fontSize: 15, fontWeight: '700' },
});

const r = StyleSheet.create({
  row:       { flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'space-between' as const, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: COLORS.gray100 },
  label:     { fontSize: 13, color: COLORS.gray500, fontWeight: '500' },
  value:     { fontSize: 13, color: COLORS.gray800, fontWeight: '600' },
  badge:     { backgroundColor: COLORS.orange100, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 100 },
  badgeText: { fontSize: 12, fontWeight: '700', color: COLORS.orange500 },
});
