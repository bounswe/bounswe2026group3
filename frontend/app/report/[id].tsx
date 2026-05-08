import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Image, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../src/constants/theme';
import { fetchObstacleDetail, type ObstacleDetail } from '../../src/api/map';
import { getMe, isLoggedIn } from '../../src/services/auth';
import InteractionBar from '../../src/components/reports/InteractionBar';
import ConfirmResolutionButton from '../../src/components/reports/ConfirmResolutionButton';

const STATUS_COLOR: Record<string, string> = {
  UNVERIFIED: COLORS.gray400,
  PASSIVE: COLORS.gray400,
  VERIFIED: COLORS.green500,
  RESOLVED_AWAITING_VALIDATION: COLORS.blue500,
  CLOSED: COLORS.gray500,
};

const STATUS_LABEL: Record<string, string> = {
  UNVERIFIED: 'Unverified',
  PASSIVE: 'Passive',
  VERIFIED: 'Verified',
  RESOLVED_AWAITING_VALIDATION: 'Awaiting Validation',
  CLOSED: 'Closed',
};

export default function ReportDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [detail, setDetail] = useState<ObstacleDetail | null>(null);
  const [currentUserId, setCurrentUserId] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [detailRes, meRes] = await Promise.all([
        fetchObstacleDetail(id as string),
        isLoggedIn() ? getMe() : Promise.resolve(null),
      ]);
      setDetail(detailRes);
      if (meRes?.ok) setCurrentUserId(meRes.data.userId ?? '');
      setLoading(false);
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={COLORS.green700} />
      </View>
    );
  }

  if (!detail) {
    return (
      <View style={s.center}>
        <Text style={s.errorText}>Obstacle not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={s.page} contentContainerStyle={s.content}>
      <TouchableOpacity style={s.back} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={20} color={COLORS.gray700} />
        <Text style={s.backText}>Map</Text>
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

      {detail.description ? (
        <Text style={s.description}>{detail.description}</Text>
      ) : null}

      {detail.photos.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.photoRow}>
          {detail.photos.map((p, i) => (
            <Image key={i} source={{ uri: p.imageUrl }} style={s.photo} />
          ))}
        </ScrollView>
      )}

      <InteractionBar
        reportId={detail.id}
        reporterId={detail.reporterId}
        upvoteCount={detail.upvoteCount}
        flagCount={detail.flagCount}
        userUpvoted={detail.userUpvoted}
        userFlagged={detail.userFlagged}
        currentUserId={currentUserId}
        onUpdate={(patch) => setDetail((d) => (d ? { ...d, ...patch } : d))}
      />

      <ConfirmResolutionButton
        reportId={detail.id}
        status={detail.status}
        reporterId={detail.reporterId}
        userUpvoted={detail.userUpvoted}
        userConfirmed={detail.userConfirmed}
        confirmationCount={detail.confirmationCount}
        currentUserId={currentUserId}
        onResolved={(newStatus, newCount) =>
          setDetail((d) =>
            d
              ? {
                  ...d,
                  status: newStatus as typeof d.status,
                  userConfirmed: true,
                  confirmationCount: newCount,
                }
              : d,
          )
        }
      />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLORS.gray100 },
  content: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 14, color: COLORS.gray500 },
  back: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 16 },
  backText: { fontSize: 14, color: COLORS.gray700 },
  title: { fontSize: 20, fontWeight: '700', color: COLORS.gray900, marginBottom: 10 },
  badges: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 12 },
  badge: { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { color: COLORS.white, fontSize: 11, fontWeight: '600' },
  description: { fontSize: 14, color: COLORS.gray700, lineHeight: 20, marginBottom: 12 },
  photoRow: { marginBottom: 12 },
  photo: { width: 200, height: 150, borderRadius: 6, marginRight: 8 },
});
