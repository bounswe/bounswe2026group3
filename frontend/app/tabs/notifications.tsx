import { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { COLORS, FONTS } from '../../src/constants/theme';
import { isLoggedIn, getMe } from '../../src/services/auth';
import { getNotifications, markNotificationRead, Notification } from '../../src/api/notifications';

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  return d.toLocaleDateString();
}

export default function NotificationsScreen() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!isLoggedIn()) { router.replace('/auth/login'); return; }
    const [meRes, notifs] = await Promise.all([getMe(), getNotifications()]);
    if (meRes.ok) {
      setNotificationsEnabled(meRes.data.notificationsEnabled ?? true);
    }
    setNotifications(notifs);
  }, [router]);

  useEffect(() => {
    setLoading(true);
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  async function handleRefresh() {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }

  async function handleTap(item: Notification) {
    if (!item.isRead) {
      setMarkingId(item.id);
      const ok = await markNotificationRead(item.id);
      if (ok) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n))
        );
      }
      setMarkingId(null);
    }
    if (item.reportId) {
      router.push(`/report/${item.reportId}` as any);
    }
  }

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator size="large" color={COLORS.green700} />
      </View>
    );
  }

  if (notificationsEnabled === false) {
    return (
      <View style={s.center} testID="notifications-disabled">
        <Ionicons name="notifications-off-outline" size={48} color={COLORS.gray300} />
        <Text style={s.disabledTitle}>Notifications are off</Text>
        <Text style={s.disabledSub}>
          You can turn them on from your profile settings.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={s.page}
      contentContainerStyle={s.scroll}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={COLORS.green700} />}
    >
      {notifications.length === 0 ? (
        <View style={s.empty} testID="notifications-empty">
          <Ionicons name="notifications-outline" size={48} color={COLORS.gray300} />
          <Text style={s.emptyText}>No notifications yet</Text>
          <Text style={s.emptySub}>Status updates on your reports will appear here.</Text>
        </View>
      ) : (
        notifications.map((item) => (
          <TouchableOpacity
            key={item.id}
            testID={`notification-item-${item.id}`}
            style={[s.item, !item.isRead && s.itemUnread]}
            onPress={() => handleTap(item)}
            activeOpacity={0.75}
          >
            <View style={[s.dot, !item.isRead && s.dotUnread]} />
            <View style={s.itemBody}>
              <Text style={[s.itemMsg, !item.isRead && s.itemMsgUnread]}>{item.message}</Text>
              <View style={s.itemMeta}>
                {!!item.reportId && (
                  <View style={s.reportRef}>
                    <Ionicons name="document-text-outline" size={12} color={COLORS.green600} />
                    <Text style={s.reportRefText}>View report</Text>
                  </View>
                )}
                <Text style={s.itemTime}>{formatTime(item.createdAt)}</Text>
              </View>
            </View>
            {markingId === item.id ? (
              <ActivityIndicator size="small" color={COLORS.gray400} style={{ marginLeft: 8 }} />
            ) : (
              item.reportId && <Ionicons name="chevron-forward" size={16} color={COLORS.gray300} style={{ marginLeft: 8 }} />
            )}
          </TouchableOpacity>
        ))
      )}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: COLORS.gray100 },
  scroll: { paddingTop: 12, paddingHorizontal: 14 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.gray100, paddingHorizontal: 32 },
empty: { alignItems: 'center', paddingVertical: 60, gap: 10 },
  emptyText: { fontFamily: FONTS.display, fontSize: 22, fontWeight: '600', color: COLORS.ink, letterSpacing: -0.3, marginTop: 4 },
  emptySub: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.inkMuted, textAlign: 'center', maxWidth: 260, lineHeight: 19 },
  disabledTitle: { fontFamily: FONTS.display, fontSize: 22, fontWeight: '600', color: COLORS.ink, letterSpacing: -0.3, marginTop: 14 },
  disabledSub: { fontFamily: FONTS.body, fontSize: 13, color: COLORS.inkMuted, textAlign: 'center', marginTop: 6, maxWidth: 260, lineHeight: 19 },
  item: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.white, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: COLORS.gray200 },
  itemUnread: { backgroundColor: COLORS.green50, borderColor: 'rgba(39,114,74,0.18)' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.gray300, marginRight: 12, flexShrink: 0 },
  dotUnread: { backgroundColor: COLORS.green600 },
  itemBody: { flex: 1, minWidth: 0 },
  itemMsg: { fontSize: 14, color: COLORS.gray700, lineHeight: 20 },
  itemMsgUnread: { fontWeight: '600', color: COLORS.gray900 },
  itemMeta: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  reportRef: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  reportRefText: { fontSize: 12, color: COLORS.green600, fontWeight: '500' },
  itemTime: { fontSize: 12, color: COLORS.gray400 },
});
