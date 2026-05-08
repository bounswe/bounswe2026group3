import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/theme';
import { confirmResolution } from '../../api/interactions';

interface ConfirmResolutionButtonProps {
  reportId: string;
  status: string;
  reporterId: string;
  userUpvoted: boolean;
  userConfirmed: boolean;
  confirmationCount: number;
  currentUserId: string;
  onResolved: (newStatus: string, confirmationCount: number) => void;
}

export default function ConfirmResolutionButton({
  reportId, status, reporterId, userUpvoted, userConfirmed, confirmationCount,
  currentUserId, onResolved,
}: ConfirmResolutionButtonProps) {
  const [loading, setLoading] = useState(false);

  const eligible =
    status === 'RESOLVED_AWAITING_VALIDATION' &&
    currentUserId !== '' &&
    (currentUserId === reporterId || userUpvoted);

  if (!eligible) return null;

  if (userConfirmed) {
    return (
      <View testID="confirm-resolution-recorded" style={s.recorded}>
        <Ionicons name="checkmark-circle" size={18} color={COLORS.green700} />
        <Text style={s.recordedText}>
          Confirmation recorded — waiting for {confirmationCount === 1 ? 'others' : 'more citizens'} to confirm.
        </Text>
      </View>
    );
  }

  async function handlePress() {
    setLoading(true);
    const res = await confirmResolution(reportId);
    setLoading(false);
    if (res.ok) {
      // Server returns the *current* status — only CLOSED once threshold is
      // reached. Earlier confirmations leave the report in
      // RESOLVED_AWAITING_VALIDATION, so we forward both the new status and
      // the new count to the parent screen.
      const newStatus = res.data.status || status;
      const newCount = res.data.confirmationCount ?? confirmationCount + 1;
      onResolved(newStatus, newCount);
    } else {
      Alert.alert('Something went wrong', 'Could not confirm resolution. Please try again.');
    }
  }

  return (
    <TouchableOpacity
      style={s.btn}
      onPress={handlePress}
      disabled={loading}
      testID="confirm-resolution-button"
    >
      {loading
        ? <ActivityIndicator size="small" color={COLORS.white} />
        : <Text style={s.text}>Confirm Resolution</Text>}
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  btn: {
    backgroundColor: COLORS.green600,
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  text: { color: COLORS.white, fontWeight: '600', fontSize: 14 },
  recorded: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: COLORS.green50,
    borderColor: 'rgba(39,114,74,0.18)',
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
  },
  recordedText: { flex: 1, fontSize: 13, color: COLORS.green700, fontWeight: '600' },
});
