import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, StyleSheet, ActivityIndicator, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/theme';
import { useLocation } from '../../hooks/useLocation';
import PhotoPicker, { type PhotoEntry } from './PhotoPicker';
import { submitReport } from '../../api/reports';
import { parseDRFError } from '../../services/auth';
import type { ObstacleCategory, ReportContext, SubmitReportResponse } from '../../types/report';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const CATEGORIES: Array<{ value: ObstacleCategory; label: string; icon: IoniconName }> = [
  { value: 'BROKEN_RAMP',       label: 'Broken Ramp',    icon: 'arrow-up-circle-outline' },
  { value: 'NARROW_SIDEWALK',   label: 'Narrow Sidewalk', icon: 'resize-outline' },
  { value: 'DAMAGED_SURFACE',   label: 'Damaged Surface', icon: 'warning-outline' },
  { value: 'ROAD_CONSTRUCTION', label: 'Construction',    icon: 'construct-outline' },
  { value: 'BLOCKED_PATH',      label: 'Blocked Path',    icon: 'stop-circle-outline' },
  { value: 'OTHER',             label: 'Other',           icon: 'ellipsis-horizontal-circle-outline' },
];

interface Props { onSuccess: (r: SubmitReportResponse) => void; }

export default function ReportForm({ onSuccess }: Props) {
  const loc = useLocation();
  const [context, setContext]       = useState<ReportContext>('OUTDOOR');
  const [category, setCategory]     = useState<ObstacleCategory | null>(null);
  const [photos, setPhotos]         = useState<PhotoEntry[]>([]);
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [apiError, setApiError]     = useState('');

  function addPhoto(p: PhotoEntry)   { setPhotos(prev => [...prev, p]); setPhotoError(''); }
  function removePhoto(i: number)    { setPhotos(prev => prev.filter((_, idx) => idx !== i)); }
  function toggleCategory(v: ObstacleCategory) { setCategory(prev => prev === v ? null : v); }

  async function handleSubmit() {
    setApiError('');
    if (photos.length === 0) { setPhotoError('At least one photo is required.'); return; }
    if (!loc.location) { setApiError('Location not available yet — please wait or tap Retry.'); return; }
    setSubmitting(true);
    try {
      const res = await submitReport({
        location: loc.location,
        context,
        category,
        description: description.trim(),
        photos: photos.map(p => p.b64),
      });
      if (res.ok) {
        onSuccess(res.data as SubmitReportResponse);
      } else {
        setApiError(parseDRFError(res.data));
      }
    } catch {
      setApiError('Unexpected error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const submitDisabled = submitting || loc.loading;

  return (
    <KeyboardAvoidingView style={s.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={s.page} contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

        {/* ── Location ── */}
        <View style={s.card}>
          <View style={s.cardTitleRow}>
            <Ionicons name="location-outline" size={18} color={COLORS.green600} />
            <Text style={s.cardTitle}>Location</Text>
          </View>
          {loc.loading && (
            <View style={s.locRow}>
              <ActivityIndicator size="small" color={COLORS.green600} />
              <Text style={s.locText}>Detecting your location…</Text>
            </View>
          )}
          {!loc.loading && loc.location && (
            <View style={s.locRow}>
              <Ionicons name="checkmark-circle" size={16} color={COLORS.green600} />
              <Text style={s.locText} numberOfLines={1}>
                {loc.location.lat.toFixed(5)}, {loc.location.lng.toFixed(5)}
              </Text>
              <TouchableOpacity onPress={loc.refetch}>
                <Text style={s.locAction}>Refresh</Text>
              </TouchableOpacity>
            </View>
          )}
          {!loc.loading && loc.permissionDenied && (
            <View style={s.locRow}>
              <Ionicons name="warning-outline" size={16} color={COLORS.orange500} />
              <Text style={[s.locText, s.locWarn, { flex: 1 }]}>Location access denied.</Text>
              <TouchableOpacity onPress={() => Linking.openSettings()}>
                <Text style={s.locAction}>Settings</Text>
              </TouchableOpacity>
            </View>
          )}
          {!loc.loading && !loc.permissionDenied && !!loc.error && (
            <View style={s.locRow}>
              <Ionicons name="alert-circle-outline" size={16} color={COLORS.red500} />
              <Text style={[s.locText, s.locErr, { flex: 1 }]} numberOfLines={2}>{loc.error}</Text>
              <TouchableOpacity onPress={loc.refetch}>
                <Text style={s.locAction}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* ── Context ── */}
        <View style={s.card}>
          <View style={s.cardTitleRow}>
            <Ionicons name="business-outline" size={18} color={COLORS.green600} />
            <Text style={s.cardTitle}>Context</Text>
          </View>
          <View style={s.toggleRow}>
            {(['OUTDOOR', 'INDOOR'] as ReportContext[]).map(c => (
              <TouchableOpacity
                key={c}
                style={[s.pill, context === c && s.pillActive]}
                onPress={() => setContext(c)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={c === 'OUTDOOR' ? 'sunny-outline' : 'home-outline'}
                  size={14}
                  color={context === c ? COLORS.white : COLORS.gray500}
                />
                <Text style={[s.pillLabel, context === c && s.pillLabelActive]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── Category ── */}
        <View style={s.card}>
          <View style={s.cardTitleRow}>
            <Ionicons name="list-outline" size={18} color={COLORS.green600} />
            <Text style={s.cardTitle}>
              Category <Text style={s.optional}>(optional)</Text>
            </Text>
          </View>
          <View style={s.grid}>
            {CATEGORIES.map(cat => {
              const active = category === cat.value;
              return (
                <TouchableOpacity
                  key={cat.value}
                  style={[s.tile, active && s.tileActive]}
                  onPress={() => toggleCategory(cat.value)}
                  activeOpacity={0.8}
                >
                  <Ionicons name={cat.icon} size={22} color={active ? COLORS.green700 : COLORS.gray500} />
                  <Text style={[s.tileLabel, active && s.tileLabelActive]}>{cat.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* ── Photo ── */}
        <View style={s.card}>
          <View style={s.cardTitleRow}>
            <Ionicons name="camera-outline" size={18} color={COLORS.green600} />
            <Text style={s.cardTitle}>Photo</Text>
          </View>
          <PhotoPicker photos={photos} onAdd={addPhoto} onRemove={removePhoto} error={photoError} />
        </View>

        {/* ── Description ── */}
        <View style={s.card}>
          <View style={s.cardTitleRow}>
            <Ionicons name="document-text-outline" size={18} color={COLORS.green600} />
            <Text style={s.cardTitle}>
              Description <Text style={s.optional}>(optional)</Text>
            </Text>
          </View>
          <TextInput
            style={s.textarea}
            placeholder="Describe the obstacle — size, severity, how it affects accessibility…"
            placeholderTextColor={COLORS.gray400}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={4}
            textAlignVertical="top"
          />
        </View>

        {/* ── API error ── */}
        {!!apiError && (
          <View style={s.apiBanner}>
            <Ionicons name="close-circle" size={18} color={COLORS.red600} />
            <Text style={s.apiBannerText}>{apiError}</Text>
          </View>
        )}

        {/* ── Submit ── */}
        <TouchableOpacity
          style={[s.submitBtn, submitDisabled && s.submitBtnOff]}
          onPress={handleSubmit}
          disabled={submitDisabled}
          activeOpacity={0.8}
        >
          {submitting ? (
            <ActivityIndicator color={COLORS.white} size="small" />
          ) : (
            <View style={s.submitRow}>
              <Ionicons name="flag" size={16} color={COLORS.white} />
              <Text style={s.submitLabel}>Submit Report</Text>
            </View>
          )}
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  flex:            { flex: 1 },
  page:            { flex: 1, backgroundColor: COLORS.gray100 },
  scroll:          { paddingTop: 12 },
  card:            { backgroundColor: COLORS.white, marginHorizontal: 14, marginBottom: 12, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: COLORS.gray200 },
  cardTitleRow:    { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 6, marginBottom: 12 },
  cardTitle:       { fontSize: 14, fontWeight: '700', color: COLORS.gray800 },
  optional:        { fontSize: 12, fontWeight: '400', color: COLORS.gray400 },
  // Location
  locRow:          { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  locText:         { fontSize: 13, color: COLORS.gray700, flex: 1 },
  locWarn:         { color: COLORS.orange500 },
  locErr:          { color: COLORS.red500 },
  locAction:       { fontSize: 12, fontWeight: '600', color: COLORS.blue600 },
  // Context toggle
  toggleRow:       { flexDirection: 'row' as const, gap: 8 },
  pill:            { flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: COLORS.gray300, backgroundColor: COLORS.white },
  pillActive:      { backgroundColor: COLORS.green700, borderColor: COLORS.green700 },
  pillLabel:       { fontSize: 13, fontWeight: '700', color: COLORS.gray500 },
  pillLabelActive: { color: COLORS.white },
  // Category grid
  grid:            { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 8 },
  tile:            { width: '47%' as const, alignItems: 'center' as const, paddingVertical: 14, borderRadius: 10, borderWidth: 1.5, borderColor: COLORS.gray200, backgroundColor: COLORS.white, gap: 6 },
  tileActive:      { borderColor: COLORS.green600, backgroundColor: COLORS.green50 },
  tileLabel:       { fontSize: 12, fontWeight: '600', color: COLORS.gray500, textAlign: 'center' as const },
  tileLabelActive: { color: COLORS.green700 },
  // Description
  textarea:        { borderWidth: 1.5, borderColor: COLORS.gray300, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: COLORS.gray900, minHeight: 96 },
  // Error banner
  apiBanner:       { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8, marginHorizontal: 14, marginBottom: 12, backgroundColor: COLORS.red50, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(239,68,68,0.15)' },
  apiBannerText:   { fontSize: 13, color: COLORS.red600, fontWeight: '500', flex: 1 },
  // Submit
  submitBtn:       { marginHorizontal: 14, paddingVertical: 16, borderRadius: 12, backgroundColor: COLORS.blue600, alignItems: 'center' as const, justifyContent: 'center' as const },
  submitBtnOff:    { backgroundColor: COLORS.gray300 },
  submitRow:       { flexDirection: 'row' as const, alignItems: 'center' as const, gap: 8 },
  submitLabel:     { color: COLORS.white, fontSize: 15, fontWeight: '700' },
});
