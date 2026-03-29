import { Stack } from 'expo-router';
import { COLORS } from '../../src/constants/theme';

export default function AuthLayout() {
  return (
    <Stack screenOptions={{ headerStyle: { backgroundColor: COLORS.green900 }, headerTintColor: COLORS.white, headerTitleStyle: { fontWeight: '700', fontSize: 17 }, headerShadowVisible: false }}>
      <Stack.Screen name="login" options={{ title: 'Sign In', headerShown: false }} />
      <Stack.Screen name="register" options={{ title: 'Create Account', headerShown: false }} />
      <Stack.Screen name="forgot-password" options={{ title: 'Reset Password' }} />
    </Stack>
  );
}
