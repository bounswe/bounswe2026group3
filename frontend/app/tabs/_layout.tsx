import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS } from '../../src/constants/theme';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: {
          backgroundColor: COLORS.bone,
          borderBottomWidth: 1,
          borderBottomColor: COLORS.rule,
        },
        headerTintColor: COLORS.ink,
        headerTitleStyle: {
          fontFamily: FONTS.display,
          fontWeight: '600',
          fontSize: 22,
          letterSpacing: -0.3,
          color: COLORS.ink,
        },
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: COLORS.bone },
        tabBarActiveTintColor: COLORS.ink,
        tabBarInactiveTintColor: COLORS.inkMuted,
        tabBarStyle: {
          backgroundColor: COLORS.bone,
          borderTopWidth: 1,
          borderTopColor: COLORS.rule,
          height: 64,
          paddingBottom: 10,
          paddingTop: 6,
        },
        tabBarLabelStyle: {
          fontFamily: FONTS.body,
          fontSize: 10,
          fontWeight: '600',
          letterSpacing: 0.4,
          textTransform: 'uppercase',
          marginTop: 0,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Map',
          headerTitle: 'AccessMap',
          tabBarIcon: ({ color, size }) => <Ionicons name="map-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen name="plan" options={{ href: null }} />
      <Tabs.Screen name="map" options={{ href: null }} />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Notifications',
          headerTitle: 'Notifications',
          tabBarIcon: ({ color, size }) => <Ionicons name="notifications-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="report"
        options={{
          title: 'Report',
          headerTitle: 'Report Obstacle',
          tabBarIcon: ({ color, size }) => <Ionicons name="flag-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          headerTitle: 'Profile',
          tabBarIcon: ({ color, size }) => <Ionicons name="person-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
