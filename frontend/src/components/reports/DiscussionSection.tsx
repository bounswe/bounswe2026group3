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

const AVATAR_COLORS = ['#27724A', '#2563EB', '#7C3AED', '#DB2777', '#D97706', '#0891B2'];

function avatarColor(userId: string): string {
  let h = 0;
  for (const ch of userId) h = (h * 31 + ch.charCodeAt(0)) & 0xffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function initials(fullName: string): string {
  return fullName.split(' ').slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

interface Props {
  reportId: string;
  currentUserId: string;
  readonly?: boolean;
}

export default function DiscussionSection({ reportId, currentUserId, readonly = false }: Props) {
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
      <View style={s.sectionHeader}>
        <Text style={s.heading}>Discussion</Text>
        {!loading && comments.length > 0 && (
          <View style={s.countBadge}>
            <Text style={s.countText}>{comments.length}</Text>
          </View>
        )}
      </View>

      {loading ? (
        <ActivityIndicator size="small" color={COLORS.green700} style={{ marginVertical: 16 }} />
      ) : comments.length === 0 ? (
        <View style={s.emptyState} testID="discussion-empty">
          <Ionicons name="chatbubbles-outline" size={28} color={COLORS.gray300} />
          <Text style={s.emptyText}>No comments yet.</Text>
          <Text style={s.emptySubtext}>Be the first to share your experience.</Text>
        </View>
      ) : (
        comments.map((c) => (
          <View key={c.id} style={s.comment} testID={`comment-${c.id}`}>
            <View style={[s.avatar, { backgroundColor: avatarColor(c.author.userId) }]}>
              <Text style={s.avatarText}>{initials(c.author.fullName)}</Text>
            </View>
            <View style={s.commentContent}>
              <View style={s.commentTop}>
                <Text style={s.authorName} testID={`comment-author-${c.id}`}>{c.author.fullName}</Text>
                {c.author.role === 'TRUSTED_CONTRIBUTOR' && (
                  <TrustedContributorBadge size={13} testID={`comment-badge-${c.id}`} />
                )}
                <Text style={s.timestamp}>{timeAgo(c.createdAt)}</Text>
              </View>
              {c.author.mobilityAidType && c.author.mobilityAidType !== 'NONE' && (
                <Text style={s.aidLabel} testID={`comment-aid-${c.id}`}>
                  {AID_LABEL[c.author.mobilityAidType] ?? c.author.mobilityAidType}
                </Text>
              )}
              <Text style={s.body} testID={`comment-body-${c.id}`}>{c.body}</Text>
            </View>
          </View>
        ))
      )}

      {!readonly && (isGuest ? (
        <View style={s.guestPrompt} testID="discussion-guest-prompt">
          <Ionicons name="lock-closed-outline" size={14} color={COLORS.gray400} />
          <Text style={s.guestText}>Sign in to join the discussion</Text>
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
              : <Ionicons name="send" size={15} color={COLORS.white} />}
          </TouchableOpacity>
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  section: { marginTop: 28 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  heading: { fontSize: 15, fontWeight: '700', color: COLORS.gray900 },
  countBadge: {
    backgroundColor: COLORS.green100,
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 1,
  },
  countText: { fontSize: 11, fontWeight: '700', color: COLORS.green700 },

  emptyState: { alignItems: 'center', paddingVertical: 24, gap: 4 },
  emptyText: { fontSize: 14, fontWeight: '600', color: COLORS.gray400 },
  emptySubtext: { fontSize: 12, color: COLORS.gray300 },

  comment: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: COLORS.white,
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: COLORS.gray200,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: { fontSize: 13, fontWeight: '700', color: COLORS.white },
  commentContent: { flex: 1 },
  commentTop: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 2 },
  authorName: { fontSize: 13, fontWeight: '700', color: COLORS.gray900 },
  timestamp: { fontSize: 11, color: COLORS.gray400, marginLeft: 'auto' },
  aidLabel: { fontSize: 11, color: COLORS.green700, fontWeight: '500', marginBottom: 4 },
  body: { fontSize: 13, color: COLORS.gray700, lineHeight: 19 },

  guestPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: COLORS.gray50,
    borderWidth: 1,
    borderColor: COLORS.gray200,
    marginTop: 4,
  },
  guestText: { fontSize: 13, color: COLORS.gray500 },

  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 4 },
  input: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: COLORS.gray200,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13,
    color: COLORS.gray900,
    backgroundColor: COLORS.white,
    minHeight: 42,
    maxHeight: 100,
    textAlignVertical: 'top',
  },
  submitBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: COLORS.green700,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitDisabled: { opacity: 0.35 },
});
