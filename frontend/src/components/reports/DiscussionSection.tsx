import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/theme';
import { TrustedContributorBadge } from '../profile/TrustedContributorBadge';
import { getComments, postComment, type Comment } from '../../api/comments';

const AID_LABEL: Record<string, string> = {
  WHEELCHAIR: 'Wheelchair user',
  ELECTRIC_WHEELCHAIR: 'Electric wheelchair user',
  WALKER: 'Walker user',
  CRUTCHES: 'Crutches user',
  STROLLER: 'Stroller user',
  HAND_CART: 'Hand cart user',
};

interface Props {
  reportId: string;
  currentUserId: string;
}

export default function DiscussionSection({ reportId, currentUserId }: Props) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inFlight = useRef(false);

  const isGuest = currentUserId === '';

  useEffect(() => {
    getComments(reportId).then((data) => {
      setComments(data);
      setLoading(false);
    });
  }, [reportId]);

  async function handleSubmit() {
    if (inFlight.current || !body.trim()) return;
    inFlight.current = true;
    setSubmitting(true);
    const comment = await postComment(reportId, body.trim());
    setSubmitting(false);
    inFlight.current = false;
    if (comment) {
      setComments((prev) => [...prev, comment]);
      setBody('');
    }
  }

  return (
    <View style={s.section} testID="discussion-section">
      <Text style={s.heading}>Discussion</Text>

      {loading ? (
        <ActivityIndicator size="small" color={COLORS.green700} style={{ marginVertical: 12 }} />
      ) : comments.length === 0 ? (
        <Text style={s.empty} testID="discussion-empty">No comments yet. Be the first to share your experience.</Text>
      ) : (
        comments.map((c) => (
          <View key={c.id} style={s.comment} testID={`comment-${c.id}`}>
            <View style={s.commentHeader}>
              <Text style={s.authorName} testID={`comment-author-${c.id}`}>{c.author.fullName}</Text>
              {c.author.role === 'TRUSTED_CONTRIBUTOR' && (
                <TrustedContributorBadge
                  size={14}
                  testID={`comment-badge-${c.id}`}
                />
              )}
            </View>
            {c.author.mobilityAidType && c.author.mobilityAidType !== 'NONE' && (
              <Text style={s.aidLabel} testID={`comment-aid-${c.id}`}>
                {AID_LABEL[c.author.mobilityAidType] ?? c.author.mobilityAidType}
              </Text>
            )}
            <Text style={s.body} testID={`comment-body-${c.id}`}>{c.body}</Text>
          </View>
        ))
      )}

      {isGuest ? (
        <View style={s.guestPrompt} testID="discussion-guest-prompt">
          <Ionicons name="chatbubble-outline" size={16} color={COLORS.gray400} />
          <Text style={s.guestText}>Sign in to comment</Text>
        </View>
      ) : (
        <View style={s.inputRow} testID="discussion-input-row">
          <TextInput
            testID="comment-input"
            style={s.input}
            value={body}
            onChangeText={setBody}
            placeholder="Add a comment…"
            placeholderTextColor={COLORS.gray400}
            multiline
          />
          <TouchableOpacity
            testID="comment-submit"
            style={[s.submitBtn, (!body.trim() || submitting) && s.submitDisabled]}
            onPress={handleSubmit}
            disabled={!body.trim() || submitting}
          >
            {submitting
              ? <ActivityIndicator size="small" color={COLORS.white} />
              : <Ionicons name="send" size={16} color={COLORS.white} />}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  section: { marginTop: 24 },
  heading: { fontSize: 16, fontWeight: '700', color: COLORS.gray900, marginBottom: 12 },
  empty: { fontSize: 13, color: COLORS.gray400, marginBottom: 12 },
  comment: {
    backgroundColor: COLORS.white,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.gray200,
  },
  commentHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  authorName: { fontSize: 13, fontWeight: '700', color: COLORS.gray800 },
  aidLabel: { fontSize: 11, color: COLORS.gray500, marginBottom: 4 },
  body: { fontSize: 13, color: COLORS.gray700, lineHeight: 18 },
  guestPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: COLORS.gray200,
    marginTop: 4,
  },
  guestText: { fontSize: 13, color: COLORS.gray500 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 4 },
  input: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: COLORS.gray300,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: COLORS.gray900,
    backgroundColor: COLORS.white,
    minHeight: 40,
    maxHeight: 100,
    textAlignVertical: 'top',
  },
  submitBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: COLORS.green700,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitDisabled: { opacity: 0.4 },
});
