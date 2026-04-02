import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '../../src/constants/theme';

export default function PlanScreen() {
  return (<View style={s.c}><Text style={s.t}>Route Planning</Text><Text style={s.s}>Coming in Milestone 2</Text></View>);
}
const s = StyleSheet.create({ c: { flex: 1, backgroundColor: COLORS.gray100, alignItems: 'center', justifyContent: 'center' }, t: { fontSize: 18, fontWeight: '700', color: COLORS.gray800, marginBottom: 6 }, s: { fontSize: 13, color: COLORS.gray500 } });
