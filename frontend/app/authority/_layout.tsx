import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { COLORS } from '../../src/constants/theme';
import { clearTokens, getMe, isAuthorityRole, isLoggedIn } from '../../src/services/auth';

type Phase = 'checking' | 'allowed';

export default function AuthorityLayout() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('checking');

  useEffect(() => {
    let cancelled = false;
    async function guard() {
      if (!isLoggedIn()) {
        router.replace('/auth/login');
        return;
      }
      const res = await getMe();
      if (cancelled) return;
      if (res.status === 401) {
        clearTokens();
        router.replace('/auth/login');
        return;
      }
      if (!res.ok || !isAuthorityRole(res.data.role)) {
        router.replace('/tabs');
        return;
      }
      setPhase('allowed');
    }
    guard();
    return () => { cancelled = true; };
  }, [router]);

  if (phase === 'checking') {
    return (
      <View testID="authority-guard-loading" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.white }}>
        <ActivityIndicator size="large" color={COLORS.green700} />
      </View>
    );
  }

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.green900 },
        headerTintColor: COLORS.white,
        headerTitleStyle: { fontWeight: '700', fontSize: 17 },
        headerShadowVisible: false,
      }}
    >
      <Stack.Screen name="dashboard" options={{ title: 'Authority Portal', headerTitle: 'Authority Portal' }} />
      <Stack.Screen name="report/[id]" options={{ title: 'Report' }} />
    </Stack>
  );
}
