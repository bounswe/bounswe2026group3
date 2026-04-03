import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../src/constants/theme';

export default function MapScreen() {
  return (
    <View style={s.container}>
      <View style={s.pin}>
        <Ionicons name="map" size={28} color={COLORS.green700} />
      </View>
      <Text style={s.title}>Accessibility Map</Text>
      <Text style={s.sub}>
        {'Boğaziçi University · North & South Campuses\nInteractive map coming soon.'}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#DCE8D4', alignItems: 'center', justifyContent: 'center', padding: 24 },
  pin: { width: 60, height: 60, borderRadius: 30, backgroundColor: COLORS.green100, alignItems: 'center', justifyContent: 'center', marginBottom: 14, borderWidth: 3, borderColor: COLORS.white },
  title: { fontSize: 17, fontWeight: '700', color: COLORS.gray800, marginBottom: 6 },
  sub: { fontSize: 13, color: COLORS.gray500, textAlign: 'center', lineHeight: 20 },
});
