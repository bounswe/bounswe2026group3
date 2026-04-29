import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { COLORS } from '../../constants/theme';
import { confirmResolution } from '../../api/interactions';

interface ConfirmResolutionButtonProps {
  reportId: string;
  status: string;
  reporterId: string;
  userUpvoted: boolean;
  currentUserId: string;
  onResolved: () => void;
}

export default function ConfirmResolutionButton({
  reportId, status, reporterId, userUpvoted, currentUserId, onResolved,
}: ConfirmResolutionButtonProps) {
  const [loading, setLoading] = useState(false);

  const eligible =
    status === 'RESOLVED_AWAITING_VALIDATION' &&
    currentUserId !== '' &&
    (currentUserId === reporterId || userUpvoted);

  if (!eligible) return null;

  async function handlePress() {
    setLoading(true);
    const res = await confirmResolution(reportId);
    setLoading(false);
    if (res.ok) {
      onResolved();
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
});
