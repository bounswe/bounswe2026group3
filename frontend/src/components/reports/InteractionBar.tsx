import { useState } from 'react';
import { Alert, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

function showAlert(title: string, message: string) {
  if (Platform.OS === 'web') {
    window.alert(`${title}\n\n${message}`);
  } else {
    showAlert(title, message);
  }
}
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/theme';
import type { ObstacleDetail } from '../../api/map';
import { postUpvote, postFlag } from '../../api/interactions';

export interface InteractionBarProps {
  reportId: string;
  reporterId: string;
  upvoteCount: number;
  flagCount: number;
  userUpvoted: boolean;
  userFlagged: boolean;
  currentUserId: string;
  onUpdate: (patch: Partial<ObstacleDetail>) => void;
}

const VALID_STATUSES = new Set([
  'UNVERIFIED', 'PASSIVE', 'VERIFIED', 'RESOLVED_AWAITING_VALIDATION', 'CLOSED',
]);

export default function InteractionBar({
  reportId, reporterId, upvoteCount, flagCount,
  userUpvoted, userFlagged, currentUserId, onUpdate,
}: InteractionBarProps) {
  const [upvoting, setUpvoting] = useState(false);
  const [flagging, setFlagging] = useState(false);

  const isOwn = currentUserId !== '' && currentUserId === reporterId;
  const isGuest = currentUserId === '';

  async function handleUpvote() {
    if (isGuest) {
      showAlert('Sign in to vote', 'You need to be logged in to upvote reports.');
      return;
    }
    if (userFlagged) {
      showAlert('Cannot upvote', 'You have already flagged this report. Remove your flag first.');
      return;
    }
    if (upvoting) return;

    const nextUpvoted = !userUpvoted;
    const nextCount = nextUpvoted ? upvoteCount + 1 : upvoteCount - 1;
    onUpdate({ upvoteCount: nextCount, userUpvoted: nextUpvoted });

    setUpvoting(true);
    const res = await postUpvote(reportId);
    setUpvoting(false);

    if (!res.ok) {
      onUpdate({ upvoteCount, userUpvoted });
      if (res.status === 409) {
        showAlert('Cannot upvote', 'You have already flagged this report. Remove your flag first.');
      } else {
        showAlert('Something went wrong', 'Could not upvote. Please try again.');
      }
      return;
    }

    const patch: Partial<ObstacleDetail> = {
      upvoteCount: typeof res.data.upvoteCount === 'number' ? res.data.upvoteCount : nextCount,
      userUpvoted: typeof res.data.userUpvoted === 'boolean' ? res.data.userUpvoted : nextUpvoted,
    };
    if (res.data.status && VALID_STATUSES.has(res.data.status)) {
      patch.status = res.data.status;
    }
    onUpdate(patch);
  }

  async function handleFlag() {
    if (isGuest) {
      showAlert('Sign in to vote', 'You need to be logged in to flag reports.');
      return;
    }
    if (userUpvoted) {
      showAlert('Cannot flag', 'You have already upvoted this report. Remove your upvote first.');
      return;
    }
    if (flagging) return;

    const nextFlagged = !userFlagged;
    const nextCount = nextFlagged ? flagCount + 1 : flagCount - 1;
    onUpdate({ flagCount: nextCount, userFlagged: nextFlagged });

    setFlagging(true);
    const res = await postFlag(reportId);
    setFlagging(false);

    if (!res.ok) {
      onUpdate({ flagCount, userFlagged });
      if (res.status === 409) {
        showAlert('Cannot flag', 'You have already upvoted this report. Remove your upvote first.');
      } else {
        showAlert('Something went wrong', 'Could not flag. Please try again.');
      }
      return;
    }

    onUpdate({
      flagCount: typeof res.data.flagCount === 'number' ? res.data.flagCount : nextCount,
      userFlagged: typeof res.data.userFlagged === 'boolean' ? res.data.userFlagged : nextFlagged,
    });
  }

  if (isOwn) {
    return (
      <View style={s.row}>
        <View style={s.disabledBtn} testID="upvote-disabled">
          <Ionicons name="thumbs-up-outline" size={16} color={COLORS.gray400} />
          <Text style={s.disabledCount} testID="upvote-count">{upvoteCount}</Text>
        </View>
        <View style={s.disabledBtn} testID="flag-disabled">
          <Ionicons name="flag-outline" size={16} color={COLORS.gray400} />
          <Text style={s.disabledCount} testID="flag-count">{flagCount}</Text>
        </View>
        <Text style={s.ownLabel}>You can't vote on your own report</Text>
      </View>
    );
  }

  return (
    <View style={s.row}>
      <TouchableOpacity
        style={[s.btn, upvoting && s.btnDisabled]}
        onPress={handleUpvote}
        disabled={upvoting}
        testID="upvote-button"
      >
        <Ionicons
          name={userUpvoted ? 'thumbs-up' : 'thumbs-up-outline'}
          size={16}
          color={upvoting ? COLORS.gray400 : userUpvoted ? COLORS.green600 : COLORS.gray600}
        />
        <Text style={[s.count, !upvoting && userUpvoted && s.activeCount]} testID="upvote-count">
          {upvoteCount}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[s.btn, flagging && s.btnDisabled]}
        onPress={handleFlag}
        disabled={flagging}
        testID="flag-button"
      >
        <Ionicons
          name={userFlagged ? 'flag' : 'flag-outline'}
          size={16}
          color={flagging ? COLORS.gray400 : userFlagged ? COLORS.red500 : COLORS.gray600}
        />
        <Text style={[s.count, !flagging && userFlagged && s.flagActiveCount]} testID="flag-count">
          {flagCount}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
  btn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 6, paddingHorizontal: 10,
    borderRadius: 6, borderWidth: 1, borderColor: COLORS.gray200,
  },
  btnDisabled: { opacity: 0.5 },
  count: { fontSize: 13, color: COLORS.gray600 },
  activeCount: { color: COLORS.green600 },
  flagActiveCount: { color: COLORS.red500 },
  disabledBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 6, paddingHorizontal: 10,
    borderRadius: 6, borderWidth: 1, borderColor: COLORS.gray200, opacity: 0.5,
  },
  disabledCount: { fontSize: 13, color: COLORS.gray400 },
  ownLabel: { fontSize: 11, color: COLORS.gray400, flex: 1 },
});
