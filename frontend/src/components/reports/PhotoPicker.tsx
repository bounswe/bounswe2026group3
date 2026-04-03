import { View, Text, Image, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/theme';

export interface PhotoEntry { uri: string; b64: string; }

interface Props {
  photos: PhotoEntry[];
  onAdd: (photo: PhotoEntry) => void;
  onRemove: (index: number) => void;
  error?: string;
}

const MAX = 3;

async function fromLibrary(): Promise<PhotoEntry | null> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: 'images',
    base64: true,
    quality: 0.7,
    allowsEditing: true,
    aspect: [4, 3],
  });
  if (res.canceled || !res.assets?.[0]?.base64) return null;
  return { uri: res.assets[0].uri, b64: res.assets[0].base64 };
}

async function fromCamera(): Promise<PhotoEntry | null> {
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') {
    Alert.alert('Permission Required', 'Camera access is needed to take a photo of the obstacle.');
    return null;
  }
  const res = await ImagePicker.launchCameraAsync({
    base64: true,
    quality: 0.7,
    allowsEditing: true,
    aspect: [4, 3],
  });
  if (res.canceled || !res.assets?.[0]?.base64) return null;
  return { uri: res.assets[0].uri, b64: res.assets[0].base64 };
}

export default function PhotoPicker({ photos, onAdd, onRemove, error }: Props) {
  const full = photos.length >= MAX;

  async function handleCamera() {
    if (full) return;
    const photo = await fromCamera();
    if (photo) onAdd(photo);
  }

  async function handleGallery() {
    if (full) return;
    const photo = await fromLibrary();
    if (photo) onAdd(photo);
  }

  return (
    <View>
      {photos.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.thumbRow} contentContainerStyle={s.thumbContent}>
          {photos.map((p, i) => (
            <View key={i} style={s.thumbWrap}>
              <Image source={{ uri: p.uri }} style={s.thumb} />
              <TouchableOpacity style={s.removeBtn} onPress={() => onRemove(i)} hitSlop={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                <Ionicons name="close-circle" size={20} color={COLORS.red500} />
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      ) : (
        <View style={s.empty}>
          <Ionicons name="camera-outline" size={28} color={COLORS.gray400} />
          <Text style={s.emptyText}>No photo added yet</Text>
        </View>
      )}

      <View style={s.btnRow}>
        <TouchableOpacity style={[s.btn, full && s.btnOff]} onPress={handleCamera} disabled={full} activeOpacity={0.8}>
          <Ionicons name="camera-outline" size={16} color={full ? COLORS.gray400 : COLORS.green700} />
          <Text style={[s.btnLabel, full && s.btnLabelOff]}>Camera</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.btn, full && s.btnOff]} onPress={handleGallery} disabled={full} activeOpacity={0.8}>
          <Ionicons name="image-outline" size={16} color={full ? COLORS.gray400 : COLORS.green700} />
          <Text style={[s.btnLabel, full && s.btnLabelOff]}>Gallery</Text>
        </TouchableOpacity>
      </View>

      {!!error && <Text style={s.err}>{error}</Text>}
      <Text style={s.hint}>At least 1 required · Max {MAX} photos</Text>
    </View>
  );
}

const s = StyleSheet.create({
  thumbRow: { marginBottom: 10 },
  thumbContent: { paddingRight: 4 },
  thumbWrap: { position: 'relative' as const, marginRight: 8 },
  thumb: { width: 84, height: 64, borderRadius: 8, backgroundColor: COLORS.gray200 },
  removeBtn: { position: 'absolute' as const, top: -8, right: -8 },
  empty: { height: 76, borderRadius: 10, borderWidth: 1.5, borderColor: COLORS.gray300, borderStyle: 'dashed' as const, alignItems: 'center' as const, justifyContent: 'center' as const, marginBottom: 10, gap: 4 },
  emptyText: { fontSize: 12, color: COLORS.gray400 },
  btnRow: { flexDirection: 'row' as const, gap: 8 },
  btn: { flex: 1, flexDirection: 'row' as const, alignItems: 'center' as const, justifyContent: 'center' as const, gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1.5, borderColor: COLORS.green700, backgroundColor: COLORS.white },
  btnOff: { borderColor: COLORS.gray300, backgroundColor: COLORS.gray50 },
  btnLabel: { fontSize: 13, fontWeight: '600', color: COLORS.green700 },
  btnLabelOff: { color: COLORS.gray400 },
  err: { fontSize: 12, color: COLORS.red600, marginTop: 8, fontWeight: '500' },
  hint: { fontSize: 11, color: COLORS.gray400, marginTop: 6 },
});
