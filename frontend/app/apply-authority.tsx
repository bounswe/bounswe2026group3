import { useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
  StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../src/constants/theme';

const MIN_REASON = 30;
const MAX_REASON = 500;

interface ApplyPayload { reason: string; orgEmail: string; }

async function submitAuthorityApplication(_payload: ApplyPayload): Promise<{ ok: boolean }> {
  // TODO(#228): replace with POST /api/auth/apply when backend endpoint lands.
  await new Promise<void>((r) => setTimeout(r, 600));
  return { ok: true };
}

export default function ApplyAuthorityScreen() {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [orgEmail, setOrgEmail] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [apiError, setApiError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function validate(): boolean {
    const e: Record<string, string> = {};
    const trimmed = reason.trim();
    if (!trimmed) e.reason = 'Please tell us why you’re applying.';
    else if (trimmed.length < MIN_REASON) e.reason = `At least ${MIN_REASON} characters (currently ${trimmed.length}).`;
    else if (trimmed.length > MAX_REASON) e.reason = `Max ${MAX_REASON} characters.`;
    const emailTrim = orgEmail.trim();
    if (emailTrim && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTrim)) e.orgEmail = 'Invalid email format';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function clr(field: string) { setErrors((p) => ({ ...p, [field]: '' })); }

  async function handleSubmit() {
    setApiError('');
    if (!validate()) return;
    setLoading(true);
    try {
      const res = await submitAuthorityApplication({ reason: reason.trim(), orgEmail: orgEmail.trim() });
      if (res.ok) setSubmitted(true);
      else setApiError('Could not submit your application. Please try again.');
    } catch {
      setApiError('Network error. Check your connection.');
    } finally {
      setLoading(false);
    }
  }

  const reasonLen = reason.trim().length;
  const reasonHint = `${reasonLen}/${MAX_REASON}`;

  if (submitted) {
    return (
      <View style={s.flex}>
        <View style={s.header}>
          <View style={s.logoBox}><Ionicons name="shield-checkmark" size={26} color={COLORS.green200} /></View>
          <Text style={s.headerTitle}>Application Submitted</Text>
          <Text style={s.headerSub}>Thanks for applying</Text>
        </View>
        <View style={s.card}>
          <View style={s.successWrap}>
            <View style={s.successIcon}>
              <Ionicons name="checkmark-circle" size={56} color={COLORS.green600} />
            </View>
            <Text style={s.successTitle}>Application submitted</Text>
            <Text style={s.successBody}>
              An admin will review it shortly. You’ll be notified once a decision is made.
            </Text>
          </View>
          <TouchableOpacity
            testID="back-to-profile"
            style={s.btnGreen}
            onPress={() => router.back()}
            activeOpacity={0.85}
          >
            <Text style={s.btnText}>Back to profile</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.header}>
          <View style={s.logoBox}><Ionicons name="shield-checkmark-outline" size={26} color={COLORS.green200} /></View>
          <Text style={s.headerTitle}>Apply to be an Authority</Text>
          <Text style={s.headerSub}>Help maintain reports for your municipality</Text>
        </View>

        <View style={s.card}>
          <View style={s.cardTitleRow}>
            <Ionicons name="document-text-outline" size={18} color={COLORS.green600} />
            <Text style={s.cardTitle}>Your application</Text>
          </View>

          {!!apiError && (
            <View style={s.apiBanner}>
              <Ionicons name="close-circle" size={18} color={COLORS.red600} />
              <Text style={s.apiBannerText}>{apiError}</Text>
            </View>
          )}

          <View style={s.labelRow}>
            <Text style={s.label}>WHY ARE YOU APPLYING?</Text>
            <Text style={[s.charCount, reasonLen > MAX_REASON && s.charCountOver]}>{reasonHint}</Text>
          </View>
          <TextInput
            testID="reason-input"
            style={[s.input, s.textarea, errors.reason ? s.inputError : null]}
            placeholder="Briefly describe your role and why you should be granted authority access (min 30 characters)."
            placeholderTextColor={COLORS.gray400}
            value={reason}
            onChangeText={(t) => { setReason(t); clr('reason'); }}
            multiline
            numberOfLines={6}
            textAlignVertical="top"
            maxLength={MAX_REASON + 1 /* allow typing one over to surface error */}
          />
          {!!errors.reason && <Text style={s.fieldError}>{errors.reason}</Text>}

          <Text style={[s.label, { marginTop: 14 }]}>ORGANIZATION EMAIL (OPTIONAL)</Text>
          <TextInput
            testID="org-email-input"
            style={[s.input, errors.orgEmail ? s.inputError : null]}
            placeholder="you@belediye.gov.tr"
            placeholderTextColor={COLORS.gray400}
            value={orgEmail}
            onChangeText={(t) => { setOrgEmail(t); clr('orgEmail'); }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
          {!!errors.orgEmail && <Text style={s.fieldError}>{errors.orgEmail}</Text>}
          <Text style={s.hint}>Helps reviewers verify your affiliation faster.</Text>

          <View style={s.actions}>
            <TouchableOpacity
              testID="cancel-button"
              style={s.btnOutline}
              onPress={() => router.back()}
              activeOpacity={0.8}
              disabled={loading}
            >
              <Text style={s.btnOutlineText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="submit-button"
              style={[s.btnGreen, s.btnFlex]}
              onPress={handleSubmit}
              activeOpacity={0.85}
              disabled={loading}
            >
              {loading
                ? <ActivityIndicator color={COLORS.white} size="small" />
                : <Text style={s.btnText}>Submit application</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  flex: { flex: 1, backgroundColor: COLORS.gray100 },
  scroll: { flexGrow: 1 },
  header: { backgroundColor: COLORS.green900, paddingTop: 60, paddingBottom: 28, alignItems: 'center', paddingHorizontal: 18 },
  logoBox: { width: 52, height: 52, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  headerTitle: { fontSize: 22, fontWeight: '800', color: COLORS.white, letterSpacing: -0.5, textAlign: 'center' },
  headerSub: { fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 4, textAlign: 'center' },

  card: { backgroundColor: COLORS.white, marginHorizontal: 14, marginTop: 14, borderRadius: 14, padding: 18, borderWidth: 1, borderColor: COLORS.gray200 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: COLORS.gray800 },

  apiBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: COLORS.red50, padding: 12, borderRadius: 10, marginBottom: 14, borderWidth: 1, borderColor: 'rgba(239,68,68,0.15)' },
  apiBannerText: { fontSize: 13, color: COLORS.red600, fontWeight: '500', flex: 1 },

  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  label: { fontSize: 12, fontWeight: '700', color: COLORS.gray600, letterSpacing: 0.5 },
  charCount: { fontSize: 11, color: COLORS.gray400, fontWeight: '600' },
  charCountOver: { color: COLORS.red500 },

  input: { borderWidth: 1.5, borderColor: COLORS.gray300, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: COLORS.gray900, backgroundColor: COLORS.white },
  textarea: { minHeight: 128, paddingTop: 12 },
  inputError: { borderColor: COLORS.red500 },
  fieldError: { fontSize: 12, color: COLORS.red600, marginTop: 4, fontWeight: '500' },
  hint: { fontSize: 12, color: COLORS.gray500, marginTop: 4 },

  actions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  btnGreen: { backgroundColor: COLORS.green700, paddingVertical: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  btnFlex: { flex: 2 },
  btnText: { color: COLORS.white, fontSize: 15, fontWeight: '700' },
  btnOutline: { flex: 1, backgroundColor: COLORS.white, paddingVertical: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: COLORS.gray300 },
  btnOutlineText: { color: COLORS.gray700, fontSize: 15, fontWeight: '700' },

  successWrap: { alignItems: 'center', paddingVertical: 12, paddingHorizontal: 4, marginBottom: 12 },
  successIcon: { marginBottom: 14 },
  successTitle: { fontSize: 17, fontWeight: '800', color: COLORS.gray900, marginBottom: 6, textAlign: 'center' },
  successBody: { fontSize: 14, color: COLORS.gray600, lineHeight: 20, textAlign: 'center' },
});
