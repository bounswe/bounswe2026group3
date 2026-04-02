import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '../../src/constants/theme';

export default function ForgotPasswordScreen() {
  return (
    <View style={s.container}>
      <Text style={s.title}>Password Reset</Text>
      <Text style={s.sub}>This feature is coming soon.</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.gray100, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { fontSize: 20, fontWeight: '700', color: COLORS.gray800, marginBottom: 8 },
  sub: { fontSize: 14, color: COLORS.gray500 },
});
