import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../src/constants/theme';
import { requestPasswordReset, parseDRFError } from '../../src/services/auth';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState('');

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!email.trim()) e.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Invalid email format';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit() {
    setApiError('');
    if (!validate()) return;
    setLoading(true);
    try {
      const res = await requestPasswordReset(email.trim());
      if (res.ok || res.status === 200) {
        router.push({ pathname: '/auth/email-sent', params: { email: email.trim() } });
      } else {
        setApiError(parseDRFError(res.data));
      }
    } catch { setApiError('Network error. Check your connection.'); }
    finally { setLoading(false); }
  }

  return (
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.header}>
          <View style={s.logoBox}><Ionicons name="lock-open-outline" size={28} color={COLORS.green200} /></View>
          <Text style={s.headerTitle}>Forgot Password?</Text>
          <Text style={s.headerSub}>We'll send you a reset link</Text>
        </View>
        <View style={s.card}>
          <View style={s.cardTitleRow}>
            <Ionicons name="mail-outline" size={18} color={COLORS.green600} />
            <Text style={s.cardTitle}>Reset your password</Text>
          </View>
          <Text style={s.helpText}>
            Enter the email address associated with your account and we'll send you a link to reset your password.
          </Text>
          {!!apiError && (
            <View style={s.apiBanner}>
              <Ionicons name="close-circle" size={18} color={COLORS.red600} />
              <Text style={s.apiBannerText}>{apiError}</Text>
            </View>
          )}
          <Text style={s.label}>EMAIL</Text>
          <TextInput
            style={[s.input, errors.email && s.inputError]}
            placeholder="your@email.com"
            placeholderTextColor={COLORS.gray400}
            value={email}
            onChangeText={t => { setEmail(t); setErrors(p => ({ ...p, email: '' })); }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
          {!!errors.email && <Text style={s.fieldError}>{errors.email}</Text>}
          <TouchableOpacity style={[s.btnBlue, { marginTop: 20 }]} onPress={handleSubmit} disabled={loading} activeOpacity={0.8}>
            {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.btnText}>Send Reset Link</Text>}
          </TouchableOpacity>
        </View>
        <View style={s.footer}>
          <Text style={s.footerText}>Remember your password? </Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={s.footerLink}>Sign in</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.gray100 },
  scroll: { flexGrow: 1 },
  header: { backgroundColor: COLORS.green900, paddingTop: 60, paddingBottom: 28, alignItems: 'center' },
  logoBox: { width: 52, height: 52, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: COLORS.white, letterSpacing: -0.5 },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 4 },
  card: { backgroundColor: COLORS.white, marginHorizontal: 14, marginTop: 14, borderRadius: 14, padding: 18, borderWidth: 1, borderColor: COLORS.gray200 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: COLORS.gray800 },
  helpText: { fontSize: 13, color: COLORS.gray500, lineHeight: 20, marginBottom: 16 },
  apiBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.red50, padding: 12, borderRadius: 10, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(239,68,68,0.15)' },
  apiBannerText: { fontSize: 13, color: COLORS.red600, fontWeight: '500', flex: 1 },
  label: { fontSize: 12, fontWeight: '700', color: COLORS.gray600, letterSpacing: 0.5, marginBottom: 5 },
  input: { borderWidth: 1.5, borderColor: COLORS.gray300, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: COLORS.gray900, backgroundColor: COLORS.white },
  inputError: { borderColor: COLORS.red500 },
  fieldError: { fontSize: 12, color: COLORS.red600, marginTop: 4, fontWeight: '500' },
  btnBlue: { backgroundColor: COLORS.blue600, paddingVertical: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: COLORS.white, fontSize: 15, fontWeight: '700' },
  footer: { flexDirection: 'row', justifyContent: 'center', paddingVertical: 20 },
  footerText: { fontSize: 13, color: COLORS.gray500 },
  footerLink: { fontSize: 13, fontWeight: '600', color: COLORS.blue600 },
});
