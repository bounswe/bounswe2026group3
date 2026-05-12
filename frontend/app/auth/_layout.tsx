import { Stack } from 'expo-router';
import { COLORS, FONTS } from '../../src/constants/theme';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.ink },
        headerTintColor: COLORS.bone,
        headerTitleStyle: {
          fontFamily: FONTS.display,
          fontWeight: '600',
          fontSize: 22,
          letterSpacing: -0.3,
        },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: COLORS.bone },
      }}
    >
      <Stack.Screen name="login" options={{ title: 'Sign In', headerShown: false }} />
      <Stack.Screen name="register" options={{ title: 'Create Account', headerShown: false }} />
      <Stack.Screen name="forgot-password" options={{ title: 'Reset Password' }} />
      <Stack.Screen name="email-sent" options={{ title: 'Email Sent', headerBackVisible: false }} />
      <Stack.Screen name="reset-password" options={{ title: 'Set New Password' }} />
    </Stack>
  );
}
