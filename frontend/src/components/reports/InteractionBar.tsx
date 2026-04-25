import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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

export default function InteractionBar({
  reportId, reporterId, upvoteCount, flagCount,
  userUpvoted, userFlagged, currentUserId, onUpdate,
}: InteractionBarProps) {
  const isOwn = currentUserId !== '' && currentUserId === reporterId;
  const isGuest = currentUserId === '';

  async function handleUpvote() {
    if (isGuest) {
      Alert.alert('Sign in to vote', 'You need to be logged in to upvote reports.');
      return;
    }
    onUpdate({ upvoteCount: upvoteCount + 1, userUpvoted: true });
    const res = await postUpvote(reportId);
    if (!res.ok) {
      onUpdate({ upvoteCount, userUpvoted: false });
      Alert.alert('Something went wrong', 'Could not upvote. Please try again.');
    }
  }

  async function handleFlag() {
    if (isGuest) {
      Alert.alert('Sign in to vote', 'You need to be logged in to flag reports.');
      return;
    }
    onUpdate({ flagCount: flagCount + 1, userFlagged: true });
    const res = await postFlag(reportId);
    if (!res.ok) {
      onUpdate({ flagCount, userFlagged: false });
      Alert.alert('Something went wrong', 'Could not flag. Please try again.');
    }
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
      <TouchableOpacity style={s.btn} onPress={handleUpvote} testID="upvote-button">
        <Ionicons
          name={userUpvoted ? 'thumbs-up' : 'thumbs-up-outline'}
          size={16}
          color={userUpvoted ? COLORS.green600 : COLORS.gray600}
        />
        <Text style={[s.count, userUpvoted && s.activeCount]} testID="upvote-count">
          {upvoteCount}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity style={s.btn} onPress={handleFlag} testID="flag-button">
        <Ionicons
          name={userFlagged ? 'flag' : 'flag-outline'}
          size={16}
          color={userFlagged ? COLORS.red500 : COLORS.gray600}
        />
        <Text style={[s.count, userFlagged && s.flagActiveCount]} testID="flag-count">
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
