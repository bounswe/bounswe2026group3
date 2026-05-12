import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Switch,
  ActivityIndicator,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/theme';
import { useMobilityProfile } from '../../hooks/useMobilityProfile';
import { AidTypeChips } from './AidTypeChips';
import { MobilityAidType, MobilityProfilePayload } from '../../types/mobilityProfile';

const BLANK: MobilityProfilePayload = {
  mobilityAid: 'NONE',
  avoidStairs: false,
  avoidSteepSlopes: false,
  maxSlopeGradient: null,
};

export function MobilityProfileCard() {
  const { profile, loading, error: loadErr, save } = useMobilityProfile();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<MobilityProfilePayload>(BLANK);
  const [saving, setSaving] = useState(false);
  const [saveErr, setSaveErr] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  function startEdit() {
    setForm(
      profile
        ? {
            mobilityAid: profile.mobilityAid,
            avoidStairs: profile.avoidStairs,
            avoidSteepSlopes: profile.avoidSteepSlopes,
            maxSlopeGradient: profile.maxSlopeGradient,
          }
        : BLANK,
    );
    setSaveErr('');
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setSaveErr('');
  }

  async function handleSave() {
    setSaving(true);
    setSaveErr('');
    const payload: MobilityProfilePayload = { ...form, maxSlopeGradient: null };
    try {
      await save(payload);
      setEditing(false);
      setSuccessMsg('Mobility profile saved!');
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch {
      setSaveErr('Failed to save. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={s.card}>
        <View style={s.titleRow}>
          <Ionicons name="options-outline" size={16} color={COLORS.green600} />
          <Text style={s.title}>Mobility Profile</Text>
        </View>
        <ActivityIndicator
          testID="loading-spinner"
          size="small"
          color={COLORS.green700}
          style={{ marginVertical: 20 }}
        />
      </View>
    );
  }

  return (
    <View style={s.card}>
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <View style={s.titleRow}>
        <Ionicons name="accessibility-outline" size={16} color={COLORS.green600} />
        <Text style={s.title}>Mobility Profile</Text>
        {!editing && !!profile && (
          <TouchableOpacity
            testID="edit-button"
            style={s.editBtn}
            onPress={startEdit}
            accessibilityLabel="Edit mobility profile"
          >
            <Ionicons name="create-outline" size={16} color={COLORS.gray500} />
          </TouchableOpacity>
        )}
      </View>

      {/* Load error */}
      {!!loadErr && (
        <View style={s.errBanner}>
          <Ionicons name="close-circle" size={16} color={COLORS.red600} />
          <Text style={s.errText}>{loadErr}</Text>
        </View>
      )}

      {/* Success banner */}
      {!!successMsg && (
        <View style={s.okBanner}>
          <Ionicons name="checkmark-circle" size={16} color={COLORS.green700} />
          <Text style={s.okText}>{successMsg}</Text>
        </View>
      )}

      {/* ── VIEW MODE: no profile yet ──────────────────────────────────────── */}
      {!editing && !profile && (
        <TouchableOpacity
          testID="setup-prompt"
          style={s.setupPrompt}
          onPress={startEdit}
          accessibilityRole="button"
          accessibilityLabel="Set up your mobility profile"
        >
          <Ionicons name="add-circle-outline" size={30} color={COLORS.green500} />
          <Text style={s.setupTitle}>Set up your Mobility Profile</Text>
          <Text style={s.setupSub}>
            Personalise route suggestions based on your accessibility needs.
          </Text>
        </TouchableOpacity>
      )}

      {/* ── VIEW MODE: profile exists ──────────────────────────────────────── */}
      {!editing && !!profile && (
        <View>
          <Text style={s.fieldLabel}>MOBILITY AID</Text>
          <AidTypeChips selected={profile.mobilityAid} onChange={() => {}} viewOnly />

          <View style={s.divider} />

          <View style={s.infoRow}>
            <Ionicons
              name={profile.avoidStairs ? 'checkmark-circle' : 'close-circle'}
              size={18}
              color={profile.avoidStairs ? COLORS.green600 : COLORS.gray300}
            />
            <Text style={s.infoText}>Avoid stairs</Text>
          </View>
          <View style={s.infoRow}>
            <Ionicons
              name={profile.avoidSteepSlopes ? 'checkmark-circle' : 'close-circle'}
              size={18}
              color={profile.avoidSteepSlopes ? COLORS.green600 : COLORS.gray300}
            />
            <Text style={s.infoText}>Avoid steep slopes</Text>
          </View>
        </View>
      )}

      {/* ── EDIT MODE ─────────────────────────────────────────────────────── */}
      {editing && (
        <View>
          <Text style={s.fieldLabel}>MOBILITY AID</Text>
          <AidTypeChips
            selected={form.mobilityAid}
            onChange={(v: MobilityAidType) =>
              setForm(f => ({ ...f, mobilityAid: v }))
            }
          />

          <View style={s.divider} />

          <View style={s.switchRow}>
            <Text style={s.switchLabel}>Avoid stairs</Text>
            <Switch
              testID="avoid-stairs-switch"
              value={form.avoidStairs}
              onValueChange={v => setForm(f => ({ ...f, avoidStairs: v }))}
              trackColor={{ false: COLORS.gray300, true: COLORS.green400 }}
              thumbColor={form.avoidStairs ? COLORS.green700 : COLORS.white}
            />
          </View>

          <View style={s.switchRow}>
            <Text style={s.switchLabel}>Avoid steep slopes</Text>
            <Switch
              testID="avoid-slopes-switch"
              value={form.avoidSteepSlopes}
              onValueChange={v => setForm(f => ({ ...f, avoidSteepSlopes: v }))}
              trackColor={{ false: COLORS.gray300, true: COLORS.green400 }}
              thumbColor={form.avoidSteepSlopes ? COLORS.green700 : COLORS.white}
            />
          </View>

          {!!saveErr && (
            <View style={s.errBanner}>
              <Ionicons name="close-circle" size={16} color={COLORS.red600} />
              <Text style={s.errText}>{saveErr}</Text>
            </View>
          )}

          <View style={s.editActions}>
            <TouchableOpacity
              testID="save-button"
              style={s.btnGreen}
              onPress={handleSave}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color={COLORS.white} size="small" />
              ) : (
                <Text style={s.btnText}>Save</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              testID="cancel-button"
              style={s.btnOutline}
              onPress={cancelEdit}
              disabled={saving}
            >
              <Text style={s.btnOutlineText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: COLORS.white,
    marginHorizontal: 14,
    marginBottom: 12,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.gray200,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 14,
  },
  title: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.gray800,
  },
  editBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.gray100,
    borderWidth: 1,
    borderColor: COLORS.gray200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.gray500,
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.gray100,
    marginVertical: 12,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 5,
  },
  infoText: {
    fontSize: 14,
    color: COLORS.gray700,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  switchLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.gray800,
  },
  errBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    backgroundColor: COLORS.red50,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.15)',
  },
  errText: {
    fontSize: 12,
    color: COLORS.red600,
    fontWeight: '500',
  },
  okBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
    backgroundColor: COLORS.green50,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(39,114,74,0.15)',
  },
  okText: {
    fontSize: 12,
    color: COLORS.green700,
    fontWeight: '500',
  },
  setupPrompt: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 8,
  },
  setupTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.gray700,
  },
  setupSub: {
    fontSize: 12,
    color: COLORS.gray400,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 16,
  },
  editActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  btnGreen: {
    flex: 1,
    backgroundColor: COLORS.green700,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  btnText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '700',
  },
  btnOutline: {
    flex: 1,
    backgroundColor: COLORS.white,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.gray300,
  },
  btnOutlineText: {
    color: COLORS.gray700,
    fontSize: 14,
    fontWeight: '700',
  },
});
