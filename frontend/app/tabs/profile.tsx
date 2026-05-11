import { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, TouchableOpacity, Switch, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../src/constants/theme';
import { getMe, updateMe, patchMe, clearTokens, isLoggedIn, parseDRFError, UserProfile } from '../../src/services/auth';
import { MobilityProfileCard } from '../../src/components/profile/MobilityProfileCard';
import { TrustedContributorBadge } from '../../src/components/profile/TrustedContributorBadge';
import { getSavedPlaces, deleteSavedPlace, SavedPlace } from '../../src/api/savedPlaces';

function getInitials(name: string): string {
  if (!name) return '?';
  const p = name.trim().split(/\s+/);
  return p.length >= 2 ? (p[0][0] + p[p.length - 1][0]).toUpperCase() : p[0][0].toUpperCase();
}

export default function ProfileScreen() {
  const router = useRouter();
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loadingPage, setLoadingPage] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const [savedPlaces, setSavedPlaces] = useState<SavedPlace[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [togglingNotif, setTogglingNotif] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!isLoggedIn()) { router.replace('/auth/login'); return; }
    setLoadingPage(true);
    try {
      const res = await getMe();
      if (res.status === 401) { clearTokens(); router.replace('/auth/login'); return; }
      if (res.ok) { setUser(res.data); setEditName(res.data.fullName); setNotificationsEnabled(res.data.notificationsEnabled ?? true); }
    } catch {}
    finally { setLoadingPage(false); }
  }, [router]);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  // Refetch on every focus so a newly-saved place from the map appears
  // without needing an app reload.
  useFocusEffect(
    useCallback(() => {
      getSavedPlaces().then(setSavedPlaces);
    }, []),
  );

  async function handleDeletePlace(id: string) {
    setDeletingId(id);
    const ok = await deleteSavedPlace(id);
    if (ok) setSavedPlaces((prev) => prev.filter((p) => p.id !== id));
    setDeletingId(null);
  }

  async function handleToggleNotifications(value: boolean) {
    setNotificationsEnabled(value);
    setTogglingNotif(true);
    await patchMe({ notificationsEnabled: value });
    setTogglingNotif(false);
  }

  async function handleSave() {
    if (!editName.trim()) { setEditError('Name cannot be empty.'); return; }
    setSaving(true); setEditError('');
    try {
      const res = await updateMe({ fullName: editName.trim() });
      if (res.ok) { setUser(res.data); setEditing(false); setSuccessMsg('Profile updated!'); setTimeout(() => setSuccessMsg(''), 3000); }
      else if (res.status === 401) { clearTokens(); router.replace('/auth/login'); }
      else setEditError(parseDRFError(res.data));
    } catch { setEditError('Network error.'); }
    finally { setSaving(false); }
  }

  if (loadingPage) return (<View style={s.center}><ActivityIndicator size="large" color={COLORS.green700} /></View>);

  return (
    <ScrollView style={s.page} contentContainerStyle={s.scroll}>
      {!!successMsg && (<View style={s.okBanner}><Ionicons name="checkmark-circle" size={18} color={COLORS.green700} /><Text style={s.okText}>{successMsg}</Text></View>)}

      <View style={s.card}>
        <View style={s.profileRow}>
          <View style={s.avatar}><Text style={s.avatarText}>{getInitials(user?.fullName || '')}</Text></View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.name}>{user?.fullName || '—'}</Text>
            <Text style={s.email}>{user?.email || '—'}</Text>
            <View style={s.badgeRow}>
              <View style={[s.badge, s.badgeGreen]}><Ionicons name="shield-checkmark" size={12} color={COLORS.green700} /><Text style={[s.badgeText, { color: COLORS.green700 }]}>{user?.status || 'ACTIVE'}</Text></View>
              {user?.role === 'TRUSTED_CONTRIBUTOR' && <TrustedContributorBadge />}
            </View>
          </View>
          <TouchableOpacity style={s.editBtn} onPress={() => { setEditing(!editing); setEditError(''); }}><Ionicons name="create-outline" size={16} color={COLORS.gray500} /></TouchableOpacity>
        </View>
      </View>

      <View style={s.card}>
        <View style={s.cardTitleRow}><Ionicons name="star" size={16} color={COLORS.orange500} /><Text style={s.cardTitle}>Trust Score</Text></View>
        <View style={s.trustRow}>
          <Text testID="trust-score-value" style={s.trustValue}>{user?.trustScore ?? 0}</Text>
          <Text style={s.trustHint}>Earned from helpful reports and community contributions.</Text>
        </View>
      </View>

      {editing && (
        <View style={s.card}>
          <View style={s.cardTitleRow}><Ionicons name="create-outline" size={16} color={COLORS.green600} /><Text style={s.cardTitle}>Edit Name</Text></View>
          <Text style={s.label}>FULL NAME</Text>
          <TextInput style={s.input} value={editName} onChangeText={setEditName} placeholder="Your name" placeholderTextColor={COLORS.gray400} />
          {!!editError && (<View style={s.errBanner}><Ionicons name="close-circle" size={16} color={COLORS.red600} /><Text style={s.errText}>{editError}</Text></View>)}
          <View style={s.editActions}>
            <TouchableOpacity style={s.btnGreen} onPress={handleSave} disabled={saving}>{saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.btnSmText}>Save</Text>}</TouchableOpacity>
            <TouchableOpacity style={s.btnOutline} onPress={() => setEditing(false)}><Text style={s.btnOutlineText}>Cancel</Text></TouchableOpacity>
          </View>
        </View>
      )}

      <MobilityProfileCard />

      <View style={s.card}>
        <View style={s.cardTitleRow}>
          <Ionicons name="bookmark-outline" size={16} color={COLORS.green600} />
          <Text style={s.cardTitle}>Saved Places</Text>
        </View>
        {savedPlaces.length === 0 ? (
          <View testID="saved-places-empty" style={s.stub}>
            <Text style={s.stubP}>No saved places yet. Save frequent destinations from the route planning screen.</Text>
          </View>
        ) : (
          savedPlaces.map((place) => (
            <View key={place.id} testID={`saved-place-${place.id}`} style={s.placeRow}>
              <Ionicons name="location-outline" size={16} color={COLORS.green600} style={{ marginTop: 1 }} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.placeLabel}>{place.label}</Text>
                {!!place.address && <Text style={s.placeAddress} numberOfLines={1}>{place.address}</Text>}
              </View>
              <TouchableOpacity
                testID={`delete-place-${place.id}`}
                onPress={() => handleDeletePlace(place.id)}
                disabled={deletingId === place.id}
                style={s.deleteBtn}
              >
                {deletingId === place.id
                  ? <ActivityIndicator size="small" color={COLORS.gray400} />
                  : <Ionicons name="trash-outline" size={16} color={COLORS.red500} />}
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>

      <View style={[s.card, { marginBottom: 20 }]}>
        <View style={s.cardTitleRow}><Ionicons name="ribbon-outline" size={16} color={COLORS.green600} /><Text style={s.cardTitle}>Badges</Text></View>
        <View style={s.stub}><View style={s.stubTag}><Text style={s.stubTagText}>MILESTONE 2</Text></View><Text style={s.stubP}>Earned badges from contributions and community activity.</Text></View>
      </View>

      <View style={[s.card, { marginBottom: 20 }]}>
        <View style={s.cardTitleRow}><Ionicons name="notifications-outline" size={16} color={COLORS.green600} /><Text style={s.cardTitle}>Notifications</Text></View>
        <View style={s.toggleRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.toggleLabel}>Push &amp; in-app notifications</Text>
            <Text style={s.toggleSub}>Receive updates when your report status changes.</Text>
          </View>
          <Switch
            value={notificationsEnabled}
            onValueChange={handleToggleNotifications}
            disabled={togglingNotif}
            trackColor={{ false: COLORS.gray300, true: COLORS.green400 }}
            thumbColor={notificationsEnabled ? COLORS.green700 : COLORS.gray500}
          />
        </View>
      </View>

      {user?.role !== 'INFRASTRUCTURE_AUTHORITY' && user?.role !== 'ADMINISTRATOR' && (
        <TouchableOpacity
          testID="apply-authority-entry"
          style={s.applyRow}
          onPress={() => router.push('/apply-authority')}
          activeOpacity={0.85}
        >
          <View style={s.applyIcon}>
            <Ionicons name="shield-checkmark-outline" size={18} color={COLORS.green700} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.applyTitle}>Apply to be an authority</Text>
            <Text style={s.applySub}>Maintain reports for your municipality</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={COLORS.gray400} />
        </TouchableOpacity>
      )}

      <TouchableOpacity style={s.logoutBtn} onPress={() => { clearTokens(); router.replace('/auth/login'); }}><Ionicons name="log-out-outline" size={18} color={COLORS.red600} /><Text style={s.logoutText}>Sign Out</Text></TouchableOpacity>
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLORS.gray100 },
  scroll: { paddingTop: 12 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.gray100 },
  okBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 14, marginBottom: 8, backgroundColor: COLORS.green50, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(39,114,74,0.15)' },
  okText: { fontSize: 13, color: COLORS.green700, fontWeight: '500' },
  card: { backgroundColor: COLORS.white, marginHorizontal: 14, marginBottom: 12, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: COLORS.gray200 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 },
  cardTitle: { fontSize: 14, fontWeight: '700', color: COLORS.gray800 },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 64, height: 64, borderRadius: 32, backgroundColor: COLORS.blue600, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: COLORS.white, fontSize: 22, fontWeight: '800' },
  name: { fontSize: 18, fontWeight: '800', color: COLORS.gray900 },
  email: { fontSize: 13, color: COLORS.gray500, marginTop: 1 },
  badgeRow: { flexDirection: 'row', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 100 },
  badgeGreen: { backgroundColor: COLORS.green100 },
  badgeAmber: { backgroundColor: COLORS.orange100 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  trustRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  trustValue: { fontSize: 32, fontWeight: '800', color: COLORS.green700, minWidth: 56 },
  trustHint: { flex: 1, fontSize: 12, color: COLORS.gray500, lineHeight: 17 },
  editBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.gray100, borderWidth: 1, borderColor: COLORS.gray200, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 12, fontWeight: '700', color: COLORS.gray600, letterSpacing: 0.5, marginBottom: 5 },
  input: { borderWidth: 1.5, borderColor: COLORS.gray300, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: COLORS.gray900, backgroundColor: COLORS.white },
  errBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, backgroundColor: COLORS.red50, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(239,68,68,0.15)' },
  errText: { fontSize: 12, color: COLORS.red600, fontWeight: '500' },
  editActions: { flexDirection: 'row', gap: 8, marginTop: 14 },
  btnGreen: { flex: 1, backgroundColor: COLORS.green700, paddingVertical: 11, borderRadius: 10, alignItems: 'center' },
  btnSmText: { color: COLORS.white, fontSize: 14, fontWeight: '700' },
  btnOutline: { flex: 1, backgroundColor: COLORS.white, paddingVertical: 11, borderRadius: 10, alignItems: 'center', borderWidth: 1.5, borderColor: COLORS.gray300 },
  btnOutlineText: { color: COLORS.gray700, fontSize: 14, fontWeight: '700' },
  stub: { backgroundColor: COLORS.gray50, borderWidth: 2, borderStyle: 'dashed', borderColor: COLORS.gray300, borderRadius: 10, padding: 20, alignItems: 'center' },
  stubTag: { backgroundColor: COLORS.orange100, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 100, marginBottom: 6 },
  stubTagText: { fontSize: 10, fontWeight: '800', color: COLORS.orange500, letterSpacing: 0.5 },
  stubP: { fontSize: 13, color: COLORS.gray400, textAlign: 'center', lineHeight: 20 },
  placeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.gray200 },
  placeLabel: { fontSize: 14, fontWeight: '600', color: COLORS.gray800 },
  placeAddress: { fontSize: 12, color: COLORS.gray400, marginTop: 1 },
  deleteBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  logoutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginHorizontal: 14, paddingVertical: 14, borderRadius: 10, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.gray200 },
  logoutText: { fontSize: 14, fontWeight: '600', color: COLORS.red600 },
  applyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginHorizontal: 14, marginBottom: 12, paddingVertical: 14, paddingHorizontal: 14, borderRadius: 14, backgroundColor: COLORS.white, borderWidth: 1, borderColor: COLORS.gray200 },
  applyIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: COLORS.green100, alignItems: 'center', justifyContent: 'center' },
  applyTitle: { fontSize: 14, fontWeight: '700', color: COLORS.gray800 },
  applySub: { fontSize: 12, color: COLORS.gray500, marginTop: 2 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  toggleLabel: { fontSize: 14, fontWeight: '600', color: COLORS.gray800 },
  toggleSub: { fontSize: 12, color: COLORS.gray400, marginTop: 2 },
});
