import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { COLORS } from '../../constants/theme';
import type { DashboardStatus } from '../../api/authority';

export type FilterValue = DashboardStatus | 'ALL';

interface Props {
  value: FilterValue;
  onChange: (next: FilterValue) => void;
  counts: { verified: number; awaitingValidation: number; closed: number; total: number };
}

const FILTERS: { value: FilterValue; label: string; key: 'total' | 'verified' | 'awaitingValidation' | 'closed' }[] = [
  { value: 'ALL', label: 'All', key: 'total' },
  { value: 'VERIFIED', label: 'Verified', key: 'verified' },
  { value: 'RESOLVED_AWAITING_VALIDATION', label: 'Awaiting', key: 'awaitingValidation' },
  { value: 'CLOSED', label: 'Closed', key: 'closed' },
];

export default function StatusFilterChips({ value, onChange, counts }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={s.row}
      contentContainerStyle={s.rowContent}
    >
      {FILTERS.map((f) => {
        const active = value === f.value;
        return (
          <TouchableOpacity
            key={f.value}
            testID={`filter-${f.value}`}
            style={[s.chip, active && s.chipActive]}
            onPress={() => onChange(f.value)}
            activeOpacity={0.75}
          >
            <Text style={[s.label, active && s.labelActive]}>{f.label}</Text>
            <View style={[s.badge, active && s.badgeActive]}>
              <Text style={[s.badgeText, active && s.badgeTextActive]}>{counts[f.key] ?? 0}</Text>
            </View>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  row: { flexGrow: 0 },
  rowContent: { paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 14,
    borderRadius: 100, borderWidth: 1, borderColor: COLORS.gray300,
    backgroundColor: COLORS.white,
  },
  chipActive: { backgroundColor: COLORS.green700, borderColor: COLORS.green700 },
  label: { fontSize: 13, fontWeight: '600', color: COLORS.gray700 },
  labelActive: { color: COLORS.white },
  badge: {
    minWidth: 22, paddingHorizontal: 6, paddingVertical: 1,
    borderRadius: 100, backgroundColor: COLORS.gray200,
    alignItems: 'center', justifyContent: 'center',
  },
  badgeActive: { backgroundColor: 'rgba(255,255,255,0.25)' },
  badgeText: { fontSize: 11, fontWeight: '700', color: COLORS.gray700 },
  badgeTextActive: { color: COLORS.white },
});
