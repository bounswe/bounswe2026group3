import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter, Link, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS } from '../../src/constants/theme';
import { login, setTokens, parseDRFError, getMe, landingRouteForRole } from '../../src/services/auth';

export default function LoginScreen() {
  const router = useRouter();
  const { reset } = useLocalSearchParams<{ reset?: string }>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState('');

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!email.trim()) e.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Invalid email format';
    if (!password) e.password = 'Password is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleLogin() {
    setApiError('');
    if (!validate()) return;
    setLoading(true);
    try {
      const res = await login({ email: email.trim(), password });
      if (res.ok) {
        setTokens(res.data.access, res.data.refresh);
        const me = await getMe();
        const target = me.ok ? landingRouteForRole(me.data.role) : '/tabs';
        router.replace(target as any);
      }
      else if (res.status === 401) setApiError('Invalid email or password');
      else setApiError(parseDRFError(res.data));
    } catch { setApiError('Network error. Check your connection.'); }
    finally { setLoading(false); }
  }

  return (
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.header}>
          <View style={s.logoBox}><Ionicons name="location" size={28} color={COLORS.green200} /></View>
          <Text style={s.headerTitle}>AccessMap</Text>
          <Text style={s.headerSub}>Neighborhood Accessibility Mapper</Text>
        </View>
        <View style={s.card}>
          <View style={s.cardTitleRow}><Ionicons name="lock-closed-outline" size={18} color={COLORS.green600} /><Text style={s.cardTitle}>Sign In</Text></View>
          {reset === 'success' && (
            <View style={s.successBanner}>
              <Ionicons name="checkmark-circle" size={18} color={COLORS.green600} />
              <Text style={s.successBannerText}>Password reset successfully. Sign in with your new password.</Text>
            </View>
          )}
          {!!apiError && (<View style={s.apiBanner}><Ionicons name="close-circle" size={18} color={COLORS.red600} /><Text style={s.apiBannerText}>{apiError}</Text></View>)}
          <Text style={s.label}>EMAIL</Text>
          <TextInput style={[s.input, errors.email && s.inputError]} placeholder="your@email.com" placeholderTextColor={COLORS.gray400} value={email} onChangeText={t => { setEmail(t); setErrors(p => ({...p, email: ''})); }} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
          {!!errors.email && <Text style={s.fieldError}>{errors.email}</Text>}
          <Text style={[s.label, { marginTop: 14 }]}>PASSWORD</Text>
          <View style={s.pwWrap}>
            <TextInput style={[s.input, s.pwInput, errors.password && s.inputError]} placeholder="Enter password" placeholderTextColor={COLORS.gray400} value={password} onChangeText={t => { setPassword(t); setErrors(p => ({...p, password: ''})); }} secureTextEntry={!showPw} autoComplete="current-password" />
            <TouchableOpacity style={s.pwToggle} onPress={() => setShowPw(!showPw)}><Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={20} color={COLORS.gray400} /></TouchableOpacity>
          </View>
          {!!errors.password && <Text style={s.fieldError}>{errors.password}</Text>}
          <Link href="/auth/forgot-password" style={s.forgot}>Forgot password?</Link>
          <TouchableOpacity style={s.btnBlue} onPress={handleLogin} disabled={loading} activeOpacity={0.8}>
            {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.btnText}>Sign In</Text>}
          </TouchableOpacity>
        </View>
        <View style={s.footer}><Text style={s.footerText}>Don't have an account? </Text><Link href="/auth/register" style={s.footerLink}>Sign up</Link></View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.gray100 },
  scroll: { flexGrow: 1 },
  header: { backgroundColor: COLORS.ink, paddingTop: 72, paddingBottom: 40, alignItems: 'center' },
  logoBox: { width: 56, height: 56, borderRadius: 16, backgroundColor: 'rgba(245,241,232,0.10)', alignItems: 'center', justifyContent: 'center', marginBottom: 18, borderWidth: 1, borderColor: 'rgba(245,241,232,0.18)' },
  headerTitle: { fontFamily: FONTS.display, fontSize: 32, fontWeight: '600', color: COLORS.bone, letterSpacing: -0.8 },
  headerSub: { fontFamily: FONTS.body, fontSize: 12, color: 'rgba(245,241,232,0.55)', marginTop: 6, letterSpacing: 1.5, textTransform: 'uppercase' },
  card: { backgroundColor: COLORS.white, marginHorizontal: 14, marginTop: 14, borderRadius: 14, padding: 18, borderWidth: 1, borderColor: COLORS.gray200 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  cardTitle: { fontFamily: FONTS.display, fontSize: 20, fontWeight: '600', color: COLORS.ink, letterSpacing: -0.3 },
  successBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.green50, padding: 12, borderRadius: 10, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(22,163,74,0.15)' },
  successBannerText: { fontSize: 13, color: COLORS.green600, fontWeight: '500', flex: 1 },
  apiBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.red50, padding: 12, borderRadius: 10, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(239,68,68,0.15)' },
  apiBannerText: { fontSize: 13, color: COLORS.red600, fontWeight: '500', flex: 1 },
  label: { fontSize: 12, fontWeight: '700', color: COLORS.gray600, letterSpacing: 0.5, marginBottom: 5 },
  input: { borderWidth: 1.5, borderColor: COLORS.gray300, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: COLORS.gray900, backgroundColor: COLORS.white },
  inputError: { borderColor: COLORS.red500 },
  pwWrap: { position: 'relative' as const },
  pwInput: { paddingRight: 44 },
  pwToggle: { position: 'absolute' as const, right: 12, top: 12, padding: 2 },
  fieldError: { fontSize: 12, color: COLORS.red600, marginTop: 4, fontWeight: '500' },
  forgot: { fontSize: 12, fontWeight: '600', color: COLORS.blue600, textAlign: 'right' as const, marginTop: 8, marginBottom: 16 },
  btnBlue: { backgroundColor: COLORS.ink, paddingVertical: 16, borderRadius: 4, alignItems: 'center' as const, justifyContent: 'center' as const },
  btnText: { color: COLORS.bone, fontSize: 14, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' },
  footer: { flexDirection: 'row' as const, justifyContent: 'center' as const, paddingVertical: 20 },
  footerText: { fontSize: 13, color: COLORS.gray500 },
  footerLink: { fontSize: 13, fontWeight: '600', color: COLORS.blue600 },
});
