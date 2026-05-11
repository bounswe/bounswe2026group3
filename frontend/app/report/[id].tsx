import { useEffect, useState } from 'react';
import {
  ActivityIndicator, Image, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../src/constants/theme';
import { fetchObstacleDetail, type ObstacleDetail, type StatusChange } from '../../src/api/map';
import { getMe, isLoggedIn } from '../../src/services/auth';
import InteractionBar from '../../src/components/reports/InteractionBar';
import ConfirmResolutionButton from '../../src/components/reports/ConfirmResolutionButton';
import DiscussionSection from '../../src/components/reports/DiscussionSection';

function formatDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ' · ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function parseReason(raw: string): { notes: string; photoUrl: string | null } {
  // Backend stores reason as "repair_photo_url: <url>; notes: <text>" or plain text
  const photoMatch = raw.match(/repair_photo_url:\s*(https?:\/\/\S+)/);
  const notesMatch = raw.match(/notes:\s*(.+?)(?:;|$)/);
  if (photoMatch || notesMatch) {
    return {
      photoUrl: photoMatch ? photoMatch[1].replace(/;$/, '').trim() : null,
      notes: notesMatch ? notesMatch[1].trim() : '',
    };
  }
  return { notes: raw, photoUrl: null };
}

function StatusHistorySection({ history }: { history: StatusChange[] }) {
  if (!history.length) return null;
  return (
    <View style={s.historyCard}>
      <Text style={s.historyHeading}>Status History</Text>
      {history.map((h, i) => {
        const { notes } = h.reason ? parseReason(h.reason) : { notes: '' };
        return (
          <View key={i} style={[s.historyRow, i < history.length - 1 && s.historyRowBorder]}>
            <View style={s.historyDot} />
            <View style={s.historyInfo}>
              <Text style={s.historyStatus}>
                {STATUS_LABEL[h.newStatus] ?? h.newStatus}
              </Text>
              {notes ? <Text style={s.historyReason}>{notes}</Text> : null}
              <Text style={s.historyTime}>{formatDate(h.changedAt)}</Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const STATUS_COLOR: Record<string, string> = {
  UNVERIFIED: COLORS.gray400,
  PASSIVE: COLORS.gray400,
  VERIFIED: COLORS.green600,
  RESOLVED_AWAITING_VALIDATION: COLORS.blue500,
  CLOSED: COLORS.gray500,
};

const STATUS_BG: Record<string, string> = {
  UNVERIFIED: COLORS.gray100,
  PASSIVE: COLORS.gray100,
  VERIFIED: COLORS.green100,
  RESOLVED_AWAITING_VALIDATION: COLORS.blue100,
  CLOSED: COLORS.gray100,
};

const STATUS_LABEL: Record<string, string> = {
  UNVERIFIED: 'Unverified',
  PASSIVE: 'Passive',
  VERIFIED: 'Verified',
  RESOLVED_AWAITING_VALIDATION: 'Awaiting Validation',
  CLOSED: 'Closed',
};

const CATEGORY_LABEL: Record<string, string> = {
  BROKEN_RAMP: 'Broken Ramp',
  NARROW_SIDEWALK: 'Narrow Sidewalk',
  DAMAGED_SURFACE: 'Damaged Surface',
  ROAD_CONSTRUCTION: 'Road Construction',
  BLOCKED_PATH: 'Blocked Path',
  BROKEN_ELEVATOR: 'Broken Elevator',
  INACCESSIBLE_RESTROOM: 'Inaccessible Restroom',
  NARROW_CORRIDOR: 'Narrow Corridor',
  HEAVY_DOOR: 'Heavy Door',
  SLIPPERY_FLOOR: 'Slippery Floor',
  OTHER: 'Other',
};

const CATEGORY_COLOR: Record<string, string> = {
  BROKEN_RAMP: COLORS.red500,
  NARROW_SIDEWALK: COLORS.orange500,
  DAMAGED_SURFACE: COLORS.orange500,
  ROAD_CONSTRUCTION: '#EAB308',
  BLOCKED_PATH: COLORS.red600,
  BROKEN_ELEVATOR: COLORS.orange500,
  INACCESSIBLE_RESTROOM: COLORS.orange500,
  NARROW_CORRIDOR: COLORS.orange500,
  HEAVY_DOOR: '#EAB308',
  SLIPPERY_FLOOR: COLORS.orange500,
  OTHER: COLORS.gray500,
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

  const statusColor = STATUS_COLOR[detail.status] ?? COLORS.gray400;
  const statusBg = STATUS_BG[detail.status] ?? COLORS.gray100;

  return (
    <ScrollView style={s.page} contentContainerStyle={s.content}>
      <TouchableOpacity style={s.back} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={18} color={COLORS.gray600} />
        <Text style={s.backText}>Map</Text>
      </TouchableOpacity>

      {/* Main info card */}
      <View style={s.card}>
        <Text style={s.title}>{detail.title}</Text>

        <View style={s.chips}>
          {/* Status pill */}
          <View style={[s.statusChip, { backgroundColor: statusBg }]}>
            <View style={[s.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[s.statusChipText, { color: statusColor }]}>
              {STATUS_LABEL[detail.status] ?? detail.status}
            </Text>
          </View>
          {/* Category pill */}
          {(() => {
            const catColor = CATEGORY_COLOR[detail.category] ?? COLORS.gray500;
            return (
              <View style={[s.categoryChip, { borderColor: catColor + '55' }]}>
                <View style={[s.categoryDot, { backgroundColor: catColor }]} />
                <Text style={[s.categoryChipText, { color: catColor }]}>
                  {CATEGORY_LABEL[detail.category] ?? detail.category.replace(/_/g, ' ')}
                </Text>
              </View>
            );
          })()}
          {/* Indoor/outdoor chip */}
          {detail.isIndoor !== undefined && (
            <View style={s.contextChip}>
              <Ionicons
                name={detail.isIndoor ? 'home-outline' : 'sunny-outline'}
                size={11}
                color={COLORS.gray600}
              />
              <Text style={s.contextChipText}>{detail.isIndoor ? 'Indoor' : 'Outdoor'}</Text>
            </View>
          )}
        </View>

        {detail.createdAt ? (
          <View style={s.metaRow}>
            <Ionicons name="time-outline" size={12} color={COLORS.gray400} />
            <Text style={s.metaText}>Reported {formatDate(detail.createdAt)}</Text>
          </View>
        ) : null}

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
      </View>

      {/* Interaction bar */}
      <View style={s.interactionCard}>
        <InteractionBar
          reportId={detail.id}
          reporterId={detail.reporterId}
          status={detail.status}
          upvoteCount={detail.upvoteCount}
          upvoteThreshold={detail.upvoteThreshold}
          flagCount={detail.flagCount}
          userUpvoted={detail.userUpvoted}
          userFlagged={detail.userFlagged}
          currentUserId={currentUserId}
          onUpdate={(patch) => setDetail((d) => (d ? { ...d, ...patch } : d))}
        />
      </View>

      <ConfirmResolutionButton
        reportId={detail.id}
        status={detail.status}
        reporterId={detail.reporterId}
        userUpvoted={detail.userUpvoted}
        userConfirmed={detail.userConfirmed}
        confirmationCount={detail.confirmationCount}
        confirmationThreshold={detail.confirmationThreshold}
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

      <StatusHistorySection history={detail.statusHistory} />

      <DiscussionSection reportId={detail.id} currentUserId={currentUserId} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLORS.gray100 },
  content: { padding: 16, paddingBottom: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 14, color: COLORS.gray500 },

  back: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 14 },
  backText: { fontSize: 14, fontWeight: '500', color: COLORS.gray600 },

  card: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.gray200,
  },
  title: { fontSize: 20, fontWeight: '700', color: COLORS.gray900, marginBottom: 12 },

  chips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 12 },

  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusChipText: { fontSize: 12, fontWeight: '600' },

  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.gray200,
  },
  categoryDot: { width: 6, height: 6, borderRadius: 3 },
  categoryChipText: { fontSize: 12, fontWeight: '600' },

  contextChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: COLORS.gray100,
    borderWidth: 1,
    borderColor: COLORS.gray200,
  },
  contextChipText: { fontSize: 12, fontWeight: '500', color: COLORS.gray600 },

  description: { fontSize: 14, color: COLORS.gray700, lineHeight: 21, marginBottom: 12 },
  photoRow: { marginBottom: 4 },
  photo: { width: 200, height: 150, borderRadius: 10, marginRight: 8 },

  interactionCard: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 6,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: COLORS.gray200,
  },

  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 10 },
  metaText: { fontSize: 11, color: COLORS.gray400 },

  historyCard: {
    backgroundColor: COLORS.white,
    borderRadius: 14,
    padding: 16,
    marginTop: 10,
    borderWidth: 1,
    borderColor: COLORS.gray200,
  },
  historyHeading: { fontSize: 13, fontWeight: '700', color: COLORS.gray700, marginBottom: 12 },
  historyRow: { flexDirection: 'row', gap: 10, paddingBottom: 12 },
  historyRowBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.gray100, marginBottom: 12 },
  historyDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.green500,
    marginTop: 4,
    flexShrink: 0,
  },
  historyInfo: { flex: 1 },
  historyStatus: { fontSize: 13, fontWeight: '600', color: COLORS.gray800 },
  historyReason: { fontSize: 12, color: COLORS.gray600, marginTop: 2 },
  historyPhoto: { width: '100%', height: 140, borderRadius: 8, marginTop: 8 },
  historyTime: { fontSize: 11, color: COLORS.gray400, marginTop: 4 },
});
