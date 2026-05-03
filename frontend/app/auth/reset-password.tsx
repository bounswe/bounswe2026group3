import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../src/constants/theme';
import { confirmPasswordReset, parseDRFError } from '../../src/services/auth';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token: string }>();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showPw2, setShowPw2] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState('');
  const [tokenInvalid, setTokenInvalid] = useState(false);

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!password) e.password = 'Password is required';
    else if (password.length < 8) e.password = 'Minimum 8 characters';
    if (!confirm) e.confirm = 'Please confirm your password';
    else if (password !== confirm) e.confirm = 'Passwords do not match';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function clr(field: string) { setErrors(p => ({ ...p, [field]: '' })); }

  async function handleReset() {
    setApiError('');
    setTokenInvalid(false);
    if (!token) { setTokenInvalid(true); return; }
    if (!validate()) return;
    setLoading(true);
    try {
      const res = await confirmPasswordReset(token, password);
      if (res.ok || res.status === 200) {
        router.replace({ pathname: '/auth/login', params: { reset: 'success' } });
      } else if (res.status === 400 || res.status === 404) {
        setTokenInvalid(true);
      } else {
        setApiError(parseDRFError(res.data));
      }
    } catch { setApiError('Network error. Check your connection.'); }
    finally { setLoading(false); }
  }

  if (tokenInvalid) {
    return (
      <ScrollView contentContainerStyle={s.scroll}>
        <View style={s.header}>
          <View style={s.logoBox}><Ionicons name="shield-outline" size={28} color={COLORS.green200} /></View>
          <Text style={s.headerTitle}>Link Expired</Text>
          <Text style={s.headerSub}>This reset link is no longer valid</Text>
        </View>
        <View style={s.card}>
          <View style={s.iconRow}>
            <Ionicons name="alert-circle" size={48} color={COLORS.red600} />
          </View>
          <Text style={s.expiredTitle}>Link expired or invalid</Text>
          <Text style={s.expiredBody}>
            This password reset link has expired or has already been used. Reset links are only valid for 24 hours.
          </Text>
          <TouchableOpacity
            style={s.btnBlue}
            onPress={() => router.replace('/auth/forgot-password')}
            activeOpacity={0.8}
          >
            <Text style={s.btnText}>Request new link</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.backBtn} onPress={() => router.replace('/auth/login')} activeOpacity={0.8}>
            <Text style={s.backBtnText}>Back to Sign In</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.header}>
          <View style={s.logoBox}><Ionicons name="shield-checkmark-outline" size={28} color={COLORS.green200} /></View>
          <Text style={s.headerTitle}>Set New Password</Text>
          <Text style={s.headerSub}>Choose a strong password</Text>
        </View>
        <View style={s.card}>
          <View style={s.cardTitleRow}>
            <Ionicons name="lock-closed-outline" size={18} color={COLORS.green600} />
            <Text style={s.cardTitle}>Create new password</Text>
          </View>
          {!!apiError && (
            <View style={s.apiBanner}>
              <Ionicons name="close-circle" size={18} color={COLORS.red600} />
              <Text style={s.apiBannerText}>{apiError}</Text>
            </View>
          )}
          <Text style={s.label}>NEW PASSWORD</Text>
          <View style={s.pwWrap}>
            <TextInput
              style={[s.input, s.pwInput, errors.password && s.inputError]}
              placeholder="Min 8 characters"
              placeholderTextColor={COLORS.gray400}
              value={password}
              onChangeText={t => { setPassword(t); clr('password'); }}
              secureTextEntry={!showPw}
              autoComplete="new-password"
            />
            <TouchableOpacity style={s.pwToggle} onPress={() => setShowPw(!showPw)}>
              <Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={20} color={COLORS.gray400} />
            </TouchableOpacity>
          </View>
          {!!errors.password && <Text style={s.fieldError}>{errors.password}</Text>}

          <Text style={[s.label, { marginTop: 14 }]}>CONFIRM PASSWORD</Text>
          <View style={s.pwWrap}>
            <TextInput
              style={[s.input, s.pwInput, errors.confirm && s.inputError]}
              placeholder="Re-enter password"
              placeholderTextColor={COLORS.gray400}
              value={confirm}
              onChangeText={t => { setConfirm(t); clr('confirm'); }}
              secureTextEntry={!showPw2}
              autoComplete="new-password"
            />
            <TouchableOpacity style={s.pwToggle} onPress={() => setShowPw2(!showPw2)}>
              <Ionicons name={showPw2 ? 'eye-off-outline' : 'eye-outline'} size={20} color={COLORS.gray400} />
            </TouchableOpacity>
          </View>
          {!!errors.confirm && <Text style={s.fieldError}>{errors.confirm}</Text>}

          <TouchableOpacity style={[s.btnBlue, { marginTop: 20 }]} onPress={handleReset} disabled={loading} activeOpacity={0.8}>
            {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.btnText}>Reset Password</Text>}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.gray100 },
  scroll: { flexGrow: 1, backgroundColor: COLORS.gray100 },
  header: { backgroundColor: COLORS.green900, paddingTop: 60, paddingBottom: 28, alignItems: 'center' },
  logoBox: { width: 52, height: 52, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: COLORS.white, letterSpacing: -0.5 },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 4 },
  card: { backgroundColor: COLORS.white, marginHorizontal: 14, marginTop: 14, borderRadius: 14, padding: 18, borderWidth: 1, borderColor: COLORS.gray200 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: COLORS.gray800 },
  apiBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.red50, padding: 12, borderRadius: 10, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(239,68,68,0.15)' },
  apiBannerText: { fontSize: 13, color: COLORS.red600, fontWeight: '500', flex: 1 },
  label: { fontSize: 12, fontWeight: '700', color: COLORS.gray600, letterSpacing: 0.5, marginBottom: 5 },
  input: { borderWidth: 1.5, borderColor: COLORS.gray300, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: COLORS.gray900, backgroundColor: COLORS.white },
  inputError: { borderColor: COLORS.red500 },
  pwWrap: { position: 'relative' as const },
  pwInput: { paddingRight: 44 },
  pwToggle: { position: 'absolute' as const, right: 12, top: 12, padding: 2 },
  fieldError: { fontSize: 12, color: COLORS.red600, marginTop: 4, fontWeight: '500' },
  btnBlue: { backgroundColor: COLORS.blue600, paddingVertical: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  btnText: { color: COLORS.white, fontSize: 15, fontWeight: '700' },
  iconRow: { alignItems: 'center', marginBottom: 12 },
  expiredTitle: { fontSize: 18, fontWeight: '800', color: COLORS.gray900, marginBottom: 8, textAlign: 'center' },
  expiredBody: { fontSize: 13, color: COLORS.gray500, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  backBtn: { marginTop: 12, paddingVertical: 12, alignItems: 'center' },
  backBtnText: { fontSize: 14, fontWeight: '600', color: COLORS.gray500 },
});
