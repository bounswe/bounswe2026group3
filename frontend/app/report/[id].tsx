import { View, Text, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { COLORS } from '../../src/constants/theme';

export default function ReportDetailScreen() {
  const { id } = useLocalSearchParams();
  return (<View style={s.c}><Text style={s.t}>Report #{id}</Text><Text style={s.s}>Report detail view coming in Milestone 2.</Text></View>);
}
const s = StyleSheet.create({ c: { flex: 1, backgroundColor: COLORS.gray100, alignItems: 'center', justifyContent: 'center', padding: 24 }, t: { fontSize: 18, fontWeight: '700', color: COLORS.gray800, marginBottom: 6 }, s: { fontSize: 13, color: COLORS.gray500 } });
