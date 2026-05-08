import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/theme';
import PhotoPicker, { type PhotoEntry } from '../reports/PhotoPicker';
import { resolveReport } from '../../api/authority';

interface Props {
  visible: boolean;
  reportId: string;
  reportTitle: string;
  onClose: () => void;
  onResolved: () => void;
}

export default function ResolveModal({ visible, reportId, reportTitle, onClose, onResolved }: Props) {
  const [photos, setPhotos] = useState<PhotoEntry[]>([]);
  const [photoError, setPhotoError] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState('');
  // Ref-based guard: state updates are async, so a double-tap can re-enter
  // handleSubmit before `submitting` has flipped to true.
  const inFlight = useRef(false);

  function reset() {
    setPhotos([]); setPhotoError(''); setNotes(''); setApiError(''); setSubmitting(false);
    inFlight.current = false;
  }

  function handleClose() {
    if (submitting) return;
    reset();
    onClose();
  }

  async function handleSubmit() {
    if (inFlight.current) return;
    setApiError('');
    if (photos.length === 0) {
      setPhotoError('A post-repair photo is required.');
      return;
    }
    inFlight.current = true;
    setSubmitting(true);
    const trimmedNotes = notes.trim();
    const res = await resolveReport(reportId, {
      repairPhoto: photos[0].b64,
      repairNotes: trimmedNotes || undefined,
    });
    setSubmitting(false);
    inFlight.current = false;
    if (res.ok) {
      reset();
      onResolved();
      return;
    }
    if (res.status === 409) setApiError('Report is already resolved.');
    else if (res.status === 403) setApiError('You do not have permission to resolve this report.');
    else if (res.status === 404) setApiError('Report not found.');
    else {
      const errBody = res.data as { detail?: string };
      setApiError(errBody.detail || 'Could not submit resolution.');
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={s.backdrop}>
        <View style={s.sheet} testID="resolve-modal">
          <View style={s.header}>
            <Text style={s.headerTitle}>Mark as Resolved</Text>
            <TouchableOpacity onPress={handleClose} disabled={submitting} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={22} color={COLORS.gray500} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={s.content}>
            <View style={s.targetCard}>
              <Ionicons name="location-outline" size={16} color={COLORS.green600} />
              <Text style={s.targetText} numberOfLines={2}>{reportTitle}</Text>
            </View>

            <Text style={s.sectionLabel}>POST-REPAIR PHOTO</Text>
            <Text style={s.helper}>Upload visual proof that the obstacle has been fixed.</Text>
            <PhotoPicker
              photos={photos}
              onAdd={(p) => { setPhotos([p]); setPhotoError(''); }}
              onRemove={() => setPhotos([])}
              error={photoError}
            />

            <Text style={[s.sectionLabel, { marginTop: 16 }]}>REPAIR NOTES (OPTIONAL)</Text>
            <TextInput
              testID="resolve-notes"
              style={s.notes}
              value={notes}
              onChangeText={setNotes}
              placeholder="What was repaired? Any details visible to citizens during validation."
              placeholderTextColor={COLORS.gray400}
              multiline
              numberOfLines={4}
            />

            {!!apiError && (
              <View style={s.errBanner}>
                <Ionicons name="close-circle" size={16} color={COLORS.red600} />
                <Text style={s.errText}>{apiError}</Text>
              </View>
            )}

            <View style={s.statusHint}>
              <Ionicons name="information-circle-outline" size={14} color={COLORS.orange500} />
              <Text style={s.statusHintText}>
                Status will change to <Text style={{ fontWeight: '700' }}>Awaiting Validation</Text> until citizens confirm.
              </Text>
            </View>
          </ScrollView>

          <View style={s.footer}>
            <TouchableOpacity
              style={[s.btnOutline, submitting && s.btnDisabled]}
              onPress={handleClose}
              disabled={submitting}
            >
              <Text style={s.btnOutlineText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID="resolve-submit"
              style={[s.btnGreen, submitting && s.btnDisabled]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting
                ? <ActivityIndicator color={COLORS.white} size="small" />
                : <Text style={s.btnGreenText}>Submit for Validation</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: COLORS.white,
    borderTopLeftRadius: 18, borderTopRightRadius: 18,
    maxHeight: '92%',
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 18, borderBottomWidth: 1, borderBottomColor: COLORS.gray100,
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: COLORS.gray900 },
  content: { padding: 18 },
  targetCard: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: COLORS.green50, padding: 12, borderRadius: 10, marginBottom: 16,
    borderWidth: 1, borderColor: 'rgba(39,114,74,0.15)',
  },
  targetText: { flex: 1, fontSize: 13, color: COLORS.green700, fontWeight: '600' },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: COLORS.gray600, letterSpacing: 0.5, marginBottom: 4 },
  helper: { fontSize: 12, color: COLORS.gray500, marginBottom: 10 },
  notes: {
    borderWidth: 1.5, borderColor: COLORS.gray300, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: COLORS.gray900, backgroundColor: COLORS.white,
    minHeight: 90, textAlignVertical: 'top',
  },
  errBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 14, backgroundColor: COLORS.red50, padding: 10, borderRadius: 8,
    borderWidth: 1, borderColor: 'rgba(239,68,68,0.15)',
  },
  errText: { fontSize: 12, color: COLORS.red600, fontWeight: '500', flex: 1 },
  statusHint: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: 16, backgroundColor: COLORS.orange100, padding: 10, borderRadius: 8,
  },
  statusHintText: { fontSize: 12, color: COLORS.orange500, flex: 1 },
  footer: {
    flexDirection: 'row', gap: 10, padding: 16,
    borderTopWidth: 1, borderTopColor: COLORS.gray100,
  },
  btnOutline: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    borderWidth: 1.5, borderColor: COLORS.gray300, backgroundColor: COLORS.white,
    alignItems: 'center', justifyContent: 'center',
  },
  btnOutlineText: { fontSize: 14, fontWeight: '700', color: COLORS.gray700 },
  btnGreen: {
    flex: 1.4, paddingVertical: 12, borderRadius: 10,
    backgroundColor: COLORS.green700, alignItems: 'center', justifyContent: 'center',
  },
  btnGreenText: { fontSize: 14, fontWeight: '700', color: COLORS.white },
  btnDisabled: { opacity: 0.6 },
});
