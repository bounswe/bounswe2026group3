import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/theme';

type Props = {
  label: string;
  onLabelChange: (text: string) => void;
  saving: boolean;
  error: string;
  onSave: () => void;
  onCancel: () => void;
};

const PRESETS = ['Home', 'Work'];

export default function SavePlaceModal({ label, onLabelChange, saving, error, onSave, onCancel }: Props) {
  return (
    <View style={s.overlay}>
      <View style={s.card}>
        <Text style={s.title}>Save Location</Text>
        <Text style={s.subtitle}>Choose a label for this place.</Text>
        <View style={s.presetRow}>
          {PRESETS.map((preset) => (
            <TouchableOpacity
              key={preset}
              testID={`preset-chip-${preset.toLowerCase()}`}
              style={[s.presetChip, label === preset && s.presetChipActive]}
              onPress={() => onLabelChange(preset)}
            >
              <Text style={[s.presetChipText, label === preset && s.presetChipTextActive]}>{preset}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput
          testID="save-label-input"
          style={s.input}
          placeholder="Custom label"
          placeholderTextColor={COLORS.gray400}
          value={label}
          onChangeText={onLabelChange}
          maxLength={50}
        />
        {!!error && (
          <View testID="save-error-banner" style={s.errorBanner}>
            <Ionicons name="close-circle" size={14} color={COLORS.red600} />
            <Text style={s.errorText}>{error}</Text>
          </View>
        )}
        <TouchableOpacity
          testID="save-btn"
          style={[s.saveBtn, (!label.trim() || saving) && { backgroundColor: COLORS.gray300 }]}
          onPress={onSave}
          disabled={!label.trim() || saving}
        >
          {saving
            ? <ActivityIndicator size="small" color={COLORS.white} />
            : <><Ionicons name="bookmark-outline" size={16} color={COLORS.white} /><Text style={s.saveBtnText}>Save</Text></>}
        </TouchableOpacity>
        <TouchableOpacity testID="cancel-btn" style={s.cancelBtn} onPress={onCancel}>
          <Text style={s.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'flex-end', zIndex: 30 },
  card: { width: '100%', backgroundColor: COLORS.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, gap: 12 },
  title: { fontSize: 17, fontWeight: '800', color: COLORS.gray900 },
  subtitle: { fontSize: 13, color: COLORS.gray500 },
  presetRow: { flexDirection: 'row', gap: 10 },
  presetChip: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 100, borderWidth: 1.5, borderColor: COLORS.gray300, backgroundColor: COLORS.white },
  presetChipActive: { borderColor: COLORS.green600, backgroundColor: COLORS.green50 },
  presetChipText: { fontSize: 14, fontWeight: '600', color: COLORS.gray600 },
  presetChipTextActive: { color: COLORS.green700 },
  input: { borderWidth: 1.5, borderColor: COLORS.gray300, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 15, color: COLORS.gray900, backgroundColor: COLORS.white },
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: COLORS.red50, padding: 8, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(239,68,68,0.2)' },
  errorText: { fontSize: 12, color: COLORS.red600, fontWeight: '500', flex: 1 },
  saveBtn: { backgroundColor: COLORS.green700, paddingVertical: 13, borderRadius: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 },
  saveBtnText: { color: COLORS.white, fontWeight: '700', fontSize: 15 },
  cancelBtn: { alignItems: 'center', paddingVertical: 4 },
  cancelText: { fontSize: 14, color: COLORS.gray400 },
});
