import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { COLORS } from '../src/constants/theme';
import { getMe, isLoggedIn, landingRouteForRole } from '../src/services/auth';

export default function Index() {
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoggedIn()) {
      setTarget('/auth/login');
      return;
    }
    let cancelled = false;
    getMe().then((res) => {
      if (cancelled) return;
      setTarget(res.ok ? landingRouteForRole(res.data.role) : '/tabs');
    });
    return () => { cancelled = true; };
  }, []);

  if (target === null) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.white }}>
        <ActivityIndicator size="large" color={COLORS.green700} />
      </View>
    );
  }
  return <Redirect href={target as any} />;
}
