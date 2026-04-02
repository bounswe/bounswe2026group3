import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter, Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../src/constants/theme';
import { register, setTokens, parseDRFError } from '../../src/services/auth';

export default function RegisterScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showPw2, setShowPw2] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState('');

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!email.trim()) e.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) e.email = 'Invalid email format';
    if (!fullName.trim()) e.fullName = 'Full name is required';
    if (!birthDate.trim()) e.birthDate = 'Birth date is required';
    if (!password) e.password = 'Password is required';
    else if (password.length < 8) e.password = 'Minimum 8 characters';
    if (!confirm) e.confirm = 'Confirm your password';
    else if (password !== confirm) e.confirm = 'Passwords do not match';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleRegister() {
    setApiError('');
    if (!validate()) return;
    setLoading(true);
    try {
      const payload: any = { email: email.trim(), fullName: fullName.trim(), password };
      if (birthDate.trim()) payload.birthDate = birthDate.trim();
      const res = await register(payload);
      if (res.status === 201 || res.ok) { setTokens(res.data.accessToken, res.data.refreshToken); router.replace('/tabs'); }
      else if (res.status === 400 && res.data.email) setApiError('This email is already registered');
      else setApiError(parseDRFError(res.data));
    } catch { setApiError('Network error. Check your connection.'); }
    finally { setLoading(false); }
  }

  function clr(field: string) { setErrors(p => ({ ...p, [field]: '' })); }

  return (
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.header}>
          <View style={s.logoBox}><Ionicons name="person-add" size={26} color={COLORS.green200} /></View>
          <Text style={s.headerTitle}>Create Account</Text>
          <Text style={s.headerSub}>Join the accessibility community</Text>
        </View>
        <View style={s.card}>
          <View style={s.cardTitleRow}><Ionicons name="person-outline" size={18} color={COLORS.green600} /><Text style={s.cardTitle}>Your Details</Text></View>
          {!!apiError && (<View style={s.apiBanner}><Ionicons name="close-circle" size={18} color={COLORS.red600} /><Text style={s.apiBannerText}>{apiError}</Text></View>)}

          <Text style={s.label}>EMAIL</Text>
          <TextInput style={[s.input, errors.email && s.inputError]} placeholder="your@email.com" placeholderTextColor={COLORS.gray400} value={email} onChangeText={t => { setEmail(t); clr('email'); }} keyboardType="email-address" autoCapitalize="none" autoComplete="email" />
          {!!errors.email && <Text style={s.fieldError}>{errors.email}</Text>}

          <Text style={[s.label, { marginTop: 14 }]}>FULL NAME</Text>
          <TextInput style={[s.input, errors.fullName && s.inputError]} placeholder="Ahmet Yılmaz" placeholderTextColor={COLORS.gray400} value={fullName} onChangeText={t => { setFullName(t); clr('fullName'); }} autoComplete="name" />
          {!!errors.fullName && <Text style={s.fieldError}>{errors.fullName}</Text>}

          <Text style={[s.label, { marginTop: 14 }]}>BIRTH DATE</Text>
          <TextInput style={[s.input, errors.birthDate && s.inputError]} placeholder="YYYY-MM-DD" placeholderTextColor={COLORS.gray400} value={birthDate} onChangeText={t => { setBirthDate(t); clr('birthDate'); }} />
          {!!errors.birthDate && <Text style={s.fieldError}>{errors.birthDate}</Text>}

          <View style={s.row}>
            <View style={s.half}>
              <Text style={[s.label, { marginTop: 14 }]}>PASSWORD</Text>
              <View style={s.pwWrap}>
                <TextInput style={[s.input, s.pwInput, errors.password && s.inputError]} placeholder="Min 8 chars" placeholderTextColor={COLORS.gray400} value={password} onChangeText={t => { setPassword(t); clr('password'); }} secureTextEntry={!showPw} autoComplete="new-password" />
                <TouchableOpacity style={s.pwToggle} onPress={() => setShowPw(!showPw)}><Ionicons name={showPw ? 'eye-off-outline' : 'eye-outline'} size={18} color={COLORS.gray400} /></TouchableOpacity>
              </View>
              {!!errors.password && <Text style={s.fieldError}>{errors.password}</Text>}
            </View>
            <View style={s.half}>
              <Text style={[s.label, { marginTop: 14 }]}>CONFIRM</Text>
              <View style={s.pwWrap}>
                <TextInput style={[s.input, s.pwInput, errors.confirm && s.inputError]} placeholder="Re-enter" placeholderTextColor={COLORS.gray400} value={confirm} onChangeText={t => { setConfirm(t); clr('confirm'); }} secureTextEntry={!showPw2} autoComplete="new-password" />
                <TouchableOpacity style={s.pwToggle} onPress={() => setShowPw2(!showPw2)}><Ionicons name={showPw2 ? 'eye-off-outline' : 'eye-outline'} size={18} color={COLORS.gray400} /></TouchableOpacity>
              </View>
              {!!errors.confirm && <Text style={s.fieldError}>{errors.confirm}</Text>}
            </View>
          </View>

          <TouchableOpacity style={s.btnGreen} onPress={handleRegister} disabled={loading} activeOpacity={0.8}>
            {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.btnText}>Create Account</Text>}
          </TouchableOpacity>
        </View>
        <View style={s.footer}><Text style={s.footerText}>Already have an account? </Text><Link href="/auth/login" style={s.footerLink}>Sign in</Link></View>
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
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: COLORS.gray800 },
  apiBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.red50, padding: 12, borderRadius: 10, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(239,68,68,0.15)' },
  apiBannerText: { fontSize: 13, color: COLORS.red600, fontWeight: '500', flex: 1 },
  label: { fontSize: 12, fontWeight: '700', color: COLORS.gray600, letterSpacing: 0.5, marginBottom: 5 },
  input: { borderWidth: 1.5, borderColor: COLORS.gray300, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: COLORS.gray900, backgroundColor: COLORS.white },
  inputError: { borderColor: COLORS.red500 },
  row: { flexDirection: 'row' as const, gap: 10 },
  half: { flex: 1 },
  pwWrap: { position: 'relative' as const },
  pwInput: { paddingRight: 40 },
  pwToggle: { position: 'absolute' as const, right: 10, top: 12, padding: 2 },
  fieldError: { fontSize: 12, color: COLORS.red600, marginTop: 4, fontWeight: '500' },
  btnGreen: { backgroundColor: COLORS.green700, paddingVertical: 14, borderRadius: 10, alignItems: 'center' as const, justifyContent: 'center' as const, marginTop: 18 },
  btnText: { color: COLORS.white, fontSize: 15, fontWeight: '700' },
  footer: { flexDirection: 'row' as const, justifyContent: 'center' as const, paddingVertical: 20 },
  footerText: { fontSize: 13, color: COLORS.gray500 },
  footerLink: { fontSize: 13, fontWeight: '600', color: COLORS.blue600 },
});
