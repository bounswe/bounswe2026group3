import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../../src/constants/theme';
import { fetchObstacleDetail, type ObstacleDetail } from '../../../src/api/map';
import ResolveModal from '../../../src/components/authority/ResolveModal';
import ReportMapPreview from '../../../src/components/map/ReportMapPreview';

const STATUS_COLOR: Record<string, string> = {
  VERIFIED: COLORS.green600,
  RESOLVED_AWAITING_VALIDATION: COLORS.orange500,
  CLOSED: COLORS.gray500,
};

const STATUS_LABEL: Record<string, string> = {
  VERIFIED: 'Verified',
  RESOLVED_AWAITING_VALIDATION: 'Awaiting Validation',
  CLOSED: 'Closed',
};

export default function AuthorityReportDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [detail, setDetail] = useState<ObstacleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [resolveOpen, setResolveOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetchObstacleDetail(id as string);
    setDetail(res);
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <View style={s.center}><ActivityIndicator size="large" color={COLORS.green700} /></View>;
  }

  if (!detail) {
    return (
      <View style={s.center}>
        <Text style={s.muted}>Report not found.</Text>
      </View>
    );
  }

  const canResolve = detail.status === 'VERIFIED';

  return (
    <View style={s.page}>
      <ScrollView style={s.scroll} contentContainerStyle={s.content}>
        <TouchableOpacity style={s.back} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={20} color={COLORS.gray700} />
          <Text style={s.backText}>Dashboard</Text>
        </TouchableOpacity>

        <Text style={s.title}>{detail.title}</Text>

        <View style={s.badges}>
          <View style={[s.badge, { backgroundColor: STATUS_COLOR[detail.status] ?? COLORS.gray400 }]}>
            <Text style={s.badgeText}>{STATUS_LABEL[detail.status] ?? detail.status}</Text>
          </View>
          <View style={[s.badge, { backgroundColor: COLORS.gray500 }]}>
            <Text style={s.badgeText}>{detail.category.replace(/_/g, ' ')}</Text>
          </View>
        </View>

        {!!detail.description && <Text style={s.description}>{detail.description}</Text>}

        <View style={s.mapBlock}>
          <ReportMapPreview latitude={detail.latitude} longitude={detail.longitude} />
          <View style={s.metaRow}>
            <Ionicons name="location-outline" size={14} color={COLORS.gray500} />
            <Text style={s.coordCaption}>
              {detail.latitude.toFixed(5)}, {detail.longitude.toFixed(5)}
            </Text>
          </View>
        </View>
        <View style={s.metaRow}>
          <Ionicons name="thumbs-up-outline" size={16} color={COLORS.gray500} />
          <Text style={s.metaText}>{detail.upvoteCount} community upvote{detail.upvoteCount === 1 ? '' : 's'}</Text>
        </View>

        {detail.photos.length > 0 && (
          <>
            <Text style={s.sectionLabel}>PHOTOS</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.photoRow}>
              {detail.photos.map((p, i) => (
                <Image key={i} source={{ uri: p.imageUrl }} style={s.photo} />
              ))}
            </ScrollView>
          </>
        )}

        {detail.status === 'RESOLVED_AWAITING_VALIDATION' && (
          <View style={s.infoBanner}>
            <Ionicons name="time-outline" size={16} color={COLORS.orange500} />
            <Text style={s.infoText}>Citizens are validating your repair. The report will close once enough confirmations are received.</Text>
          </View>
        )}
      </ScrollView>

      {canResolve && (
        <View style={s.cta}>
          <TouchableOpacity
            testID="open-resolve-modal"
            style={s.resolveBtn}
            onPress={() => setResolveOpen(true)}
            activeOpacity={0.85}
          >
            <Ionicons name="checkmark-circle-outline" size={18} color={COLORS.white} />
            <Text style={s.resolveBtnText}>Mark as Resolved</Text>
          </TouchableOpacity>
        </View>
      )}

      <ResolveModal
        visible={resolveOpen}
        reportId={detail.id}
        reportTitle={detail.title}
        onClose={() => setResolveOpen(false)}
        onResolved={() => {
          setResolveOpen(false);
          load();
        }}
      />
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLORS.gray100 },
  scroll: { flex: 1 },
  content: { padding: 18, paddingBottom: 96 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.gray100 },
  muted: { fontSize: 14, color: COLORS.gray500 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 14 },
  backText: { fontSize: 14, color: COLORS.gray700 },
  title: { fontSize: 20, fontWeight: '800', color: COLORS.gray900, marginBottom: 10 },
  badges: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 14 },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { color: COLORS.white, fontSize: 11, fontWeight: '700' },
  description: { fontSize: 14, color: COLORS.gray700, lineHeight: 20, marginBottom: 14 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  metaText: { fontSize: 13, color: COLORS.gray600 },
  mapBlock: { marginBottom: 10 },
  coordCaption: { fontSize: 12, color: COLORS.gray500, marginTop: 6 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: COLORS.gray600, letterSpacing: 0.5, marginTop: 14, marginBottom: 8 },
  photoRow: { marginBottom: 8 },
  photo: { width: 200, height: 150, borderRadius: 8, marginRight: 8, backgroundColor: COLORS.gray200 },
  infoBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: COLORS.orange100, padding: 12, borderRadius: 10, marginTop: 14,
  },
  infoText: { flex: 1, fontSize: 12, color: COLORS.orange500, lineHeight: 18 },
  cta: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    padding: 14, backgroundColor: COLORS.white,
    borderTopWidth: 1, borderTopColor: COLORS.gray200,
  },
  resolveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: COLORS.green700, paddingVertical: 14, borderRadius: 12,
  },
  resolveBtnText: { color: COLORS.white, fontSize: 15, fontWeight: '700' },
});
