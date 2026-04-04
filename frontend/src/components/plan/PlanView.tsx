import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/theme';

export default function PlanView() {
  return (
    <View style={s.container}>
      <Ionicons name="navigate-outline" size={32} color={COLORS.green700} />
      <Text style={s.text}>Route planning is available on web.{'\n'}Native support coming in a future milestone.</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.gray50, gap: 12 },
  text: { fontSize: 14, color: COLORS.gray600, textAlign: 'center', paddingHorizontal: 32, lineHeight: 22 },
});
