import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../src/constants/theme';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerStyle: { backgroundColor: COLORS.green900 }, headerTintColor: COLORS.white, headerTitleStyle: { fontWeight: '700', fontSize: 17 }, headerShadowVisible: false, tabBarActiveTintColor: COLORS.blue600, tabBarInactiveTintColor: COLORS.gray400, tabBarStyle: { backgroundColor: COLORS.white, borderTopWidth: 1, borderTopColor: COLORS.gray200, height: 58, paddingBottom: 6, paddingTop: 6 }, tabBarLabelStyle: { fontSize: 10, fontWeight: '600' } }}>
      <Tabs.Screen name="index" options={{ title: 'Route', headerTitle: 'Campus Map', tabBarIcon: ({ color, size }) => <Ionicons name="map-outline" size={size} color={color} /> }} />
      <Tabs.Screen name="plan" options={{ title: 'Plan', tabBarIcon: ({ color, size }) => <Ionicons name="document-text-outline" size={size} color={color} /> }} />
      <Tabs.Screen name="report" options={{ title: 'Report', headerTitle: 'Report Obstacle', tabBarIcon: ({ color, size }) => <Ionicons name="flag-outline" size={size} color={color} /> }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', headerTitle: 'Profile', tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" size={size} color={color} /> }} />
    </Tabs>
  );
}
