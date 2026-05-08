import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/theme';
import type { DashboardReport } from '../../api/authority';

const STATUS_COLOR: Record<string, string> = {
  VERIFIED: COLORS.green600,
  RESOLVED_AWAITING_VALIDATION: COLORS.orange500,
  CLOSED: COLORS.gray500,
};

const STATUS_LABEL: Record<string, string> = {
  VERIFIED: 'Verified',
  RESOLVED_AWAITING_VALIDATION: 'Awaiting',
  CLOSED: 'Closed',
};

interface Props {
  report: DashboardReport;
  onPress: (report: DashboardReport) => void;
}

export default function ReportListItem({ report, onPress }: Props) {
  return (
    <TouchableOpacity
      testID={`report-card-${report.reportId}`}
      style={s.row}
      onPress={() => onPress(report)}
      activeOpacity={0.78}
    >
      <View style={s.thumbWrap}>
        {report.thumbnailUrl ? (
          <Image source={{ uri: report.thumbnailUrl }} style={s.thumb} />
        ) : (
          <View style={[s.thumb, s.thumbEmpty]}>
            <Ionicons name="image-outline" size={20} color={COLORS.gray400} />
          </View>
        )}
      </View>
      <View style={s.body}>
        <Text style={s.title} numberOfLines={1}>{report.title}</Text>
        <Text style={s.desc} numberOfLines={2}>
          {report.description || report.category.replace(/_/g, ' ')}
        </Text>
        <View style={s.metaRow}>
          <View style={[s.statusBadge, { backgroundColor: STATUS_COLOR[report.status] ?? COLORS.gray400 }]}>
            <Text style={s.statusText}>{STATUS_LABEL[report.status] ?? report.status}</Text>
          </View>
          <View style={s.upvotes}>
            <Ionicons name="arrow-up" size={11} color={COLORS.gray500} />
            <Text style={s.upvoteText}>{report.upvoteCount}</Text>
          </View>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={COLORS.gray300} />
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: COLORS.white, padding: 12,
    borderRadius: 12, marginBottom: 8,
    borderWidth: 1, borderColor: COLORS.gray200,
  },
  thumbWrap: { width: 64, height: 64, borderRadius: 10, overflow: 'hidden' },
  thumb: { width: 64, height: 64, backgroundColor: COLORS.gray100 },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, minWidth: 0 },
  title: { fontSize: 14, fontWeight: '700', color: COLORS.gray900 },
  desc: { fontSize: 12, color: COLORS.gray500, marginTop: 2, lineHeight: 16 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 100 },
  statusText: { color: COLORS.white, fontSize: 10, fontWeight: '700' },
  upvotes: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  upvoteText: { fontSize: 11, color: COLORS.gray500, fontWeight: '600' },
});
