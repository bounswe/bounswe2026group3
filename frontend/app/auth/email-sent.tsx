import { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams, Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../src/constants/theme';
import { requestPasswordReset, parseDRFError } from '../../src/services/auth';

export default function EmailSentScreen() {
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email: string }>();
  const [loading, setLoading] = useState(false);
  const [resendError, setResendError] = useState('');
  const [resendSuccess, setResendSuccess] = useState(false);

  async function handleResend() {
    if (!email) return;
    setResendError('');
    setResendSuccess(false);
    setLoading(true);
    try {
      const res = await requestPasswordReset(email);
      if (res.ok || res.status === 200) {
        setResendSuccess(true);
      } else {
        setResendError(parseDRFError(res.data));
      }
    } catch { setResendError('Network error. Check your connection.'); }
    finally { setLoading(false); }
  }

  return (
    <ScrollView contentContainerStyle={s.scroll}>
      <View style={s.header}>
        <View style={s.logoBox}><Ionicons name="mail" size={28} color={COLORS.green200} /></View>
        <Text style={s.headerTitle}>Check Your Inbox</Text>
        <Text style={s.headerSub}>Reset link on its way</Text>
      </View>
      <View style={s.card}>
        <View style={s.iconRow}>
          <Ionicons name="checkmark-circle" size={48} color={COLORS.green600} />
        </View>
        <Text style={s.title}>Email sent!</Text>
        <Text style={s.body}>
          We sent a password reset link to{'\n'}
          <Text style={s.emailHighlight}>{email}</Text>
        </Text>
        <Text style={s.hint}>
          Check your inbox and spam folder. The link expires in 24 hours.
        </Text>
        {!!resendSuccess && (
          <View style={s.successBanner}>
            <Ionicons name="checkmark-circle" size={18} color={COLORS.green600} />
            <Text style={s.successBannerText}>A new link has been sent.</Text>
          </View>
        )}
        {!!resendError && (
          <View style={s.apiBanner}>
            <Ionicons name="close-circle" size={18} color={COLORS.red600} />
            <Text style={s.apiBannerText}>{resendError}</Text>
          </View>
        )}
        <TouchableOpacity style={s.btnOutline} onPress={handleResend} disabled={loading} activeOpacity={0.8}>
          {loading
            ? <ActivityIndicator color={COLORS.blue600} size="small" />
            : (
              <View style={s.btnOutlineInner}>
                <Ionicons name="refresh-outline" size={16} color={COLORS.blue600} />
                <Text style={s.btnOutlineText}>Resend email</Text>
              </View>
            )
          }
        </TouchableOpacity>
      </View>
      <View style={s.footer}>
        <Text style={s.footerText}>Wrong email? </Text>
        <TouchableOpacity onPress={() => router.replace('/auth/forgot-password')}>
          <Text style={s.footerLink}>Try again</Text>
        </TouchableOpacity>
      </View>
      <View style={s.footer}>
        <Link href="/auth/login" style={s.footerLink}>Back to Sign In</Link>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { flexGrow: 1, backgroundColor: COLORS.gray100 },
  header: { backgroundColor: COLORS.green900, paddingTop: 60, paddingBottom: 28, alignItems: 'center' },
  logoBox: { width: 52, height: 52, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: COLORS.white, letterSpacing: -0.5 },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 4 },
  card: { backgroundColor: COLORS.white, marginHorizontal: 14, marginTop: 14, borderRadius: 14, padding: 24, borderWidth: 1, borderColor: COLORS.gray200, alignItems: 'center' },
  iconRow: { marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '800', color: COLORS.gray900, marginBottom: 8 },
  body: { fontSize: 14, color: COLORS.gray600, textAlign: 'center', lineHeight: 22 },
  emailHighlight: { fontWeight: '700', color: COLORS.gray900 },
  hint: { fontSize: 12, color: COLORS.gray400, textAlign: 'center', marginTop: 10, marginBottom: 20, lineHeight: 18 },
  successBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.green50, padding: 12, borderRadius: 10, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(22,163,74,0.15)', width: '100%' },
  successBannerText: { fontSize: 13, color: COLORS.green600, fontWeight: '500', flex: 1 },
  apiBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.red50, padding: 12, borderRadius: 10, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(239,68,68,0.15)', width: '100%' },
  apiBannerText: { fontSize: 13, color: COLORS.red600, fontWeight: '500', flex: 1 },
  btnOutline: { borderWidth: 1.5, borderColor: COLORS.blue600, paddingVertical: 13, paddingHorizontal: 28, borderRadius: 10, alignItems: 'center', justifyContent: 'center', width: '100%' },
  btnOutlineInner: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  btnOutlineText: { color: COLORS.blue600, fontSize: 14, fontWeight: '700' },
  footer: { flexDirection: 'row', justifyContent: 'center', paddingTop: 14 },
  footerText: { fontSize: 13, color: COLORS.gray500 },
  footerLink: { fontSize: 13, fontWeight: '600', color: COLORS.blue600 },
});
