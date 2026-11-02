/**
 * FeedbackDetailScreen — Shows issue detail + comments within the app.
 */
import { useColors } from "@/styles/theme";
import type { RootStackParamList } from "@/navigation/RootNavigator";
import { getFeedbackDetail, markFeedbackReplySeen } from "@readany/core/feedback";
import type { FeedbackComment, FeedbackDetail } from "@readany/core/feedback";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ChevronLeft, ExternalLink, MessageCircle } from "lucide-react-native";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Props = NativeStackScreenProps<RootStackParamList, "FeedbackDetail">;

export default function FeedbackDetailScreen({ navigation, route }: Props) {
  const { issueNumber, title } = route.params;
  const colors = useColors();
  const { t } = useTranslation();
  const [detail, setDetail] = useState<FeedbackDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const data = await getFeedbackDetail(issueNumber);
      setDetail(data);
      setLoading(false);
      // Mark as seen
      await markFeedbackReplySeen(issueNumber).catch(() => {});
    }
    load();
  }, [issueNumber]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={["top"]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ChevronLeft size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]} numberOfLines={1}>
          #{issueNumber} {title}
        </Text>
        <TouchableOpacity
          onPress={() =>
            Linking.openURL(`https://github.com/limitlessprojects/ReadAny-App/issues/${issueNumber}`)
          }
          style={styles.externalBtn}
        >
          <ExternalLink size={18} color={colors.mutedForeground} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : !detail ? (
        <View style={styles.loadingContainer}>
          <Text style={[styles.errorText, { color: colors.mutedForeground }]}>
            {t("feedback.detailLoadFailed", "加载失败，请稍后重试")}
          </Text>
        </View>
      ) : (
        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
          {/* Status badge */}
          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusBadge,
                {
                  backgroundColor:
                    detail.state === "open" ? `${colors.primary}20` : `${colors.mutedForeground}20`,
                },
              ]}
            >
              <Text
                style={[
                  styles.statusText,
                  { color: detail.state === "open" ? colors.primary : colors.mutedForeground },
                ]}
              >
                {detail.state === "open"
                  ? t("feedback.statusOpen", "处理中")
                  : t("feedback.statusClosed", "已关闭")}
              </Text>
            </View>
            <Text style={[styles.dateText, { color: colors.mutedForeground }]}>
              {new Date(detail.createdAt).toLocaleDateString()}
            </Text>
          </View>

          {/* Issue body */}
          <View style={[styles.bodyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.bodyText, { color: colors.foreground }]}>
              {stripMarkdown(detail.body)}
            </Text>
          </View>

          {/* Comments section */}
          {detail.comments.length > 0 && (
            <View style={styles.commentsSection}>
              <View style={styles.commentHeader}>
                <MessageCircle size={14} color={colors.mutedForeground} />
                <Text style={[styles.commentHeaderText, { color: colors.mutedForeground }]}>
                  {t("feedback.replies", "回复")} ({detail.comments.length})
                </Text>
              </View>
              {detail.comments.map((comment) => (
                <CommentItem key={comment.id} comment={comment} colors={colors} />
              ))}
            </View>
          )}

          {detail.comments.length === 0 && (
            <View style={styles.noComments}>
              <Text style={[styles.noCommentsText, { color: colors.mutedForeground }]}>
                {t("feedback.noReplies", "暂无回复，我们会尽快处理。")}
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function CommentItem({
  comment,
  colors,
}: { comment: FeedbackComment; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={[styles.commentCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.commentMeta}>
        <Text style={[styles.commentAuthor, { color: colors.foreground }]}>{comment.author}</Text>
        <Text style={[styles.commentDate, { color: colors.mutedForeground }]}>
          {new Date(comment.createdAt).toLocaleDateString()}
        </Text>
      </View>
      <Text style={[styles.commentBody, { color: colors.foreground }]}>
        {stripMarkdown(comment.body)}
      </Text>
    </View>
  );
}

/** Simple markdown stripping for display */
function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/`{3}[\s\S]*?`{3}/g, "[code block]")
    .replace(/`(.+?)`/g, "$1")
    .replace(/\[(.+?)\]\(.+?\)/g, "$1")
    .replace(/^[-*]\s+/gm, "- ")
    .replace(/---\n?/g, "")
    .trim();
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  backBtn: { padding: 4, marginRight: 4 },
  headerTitle: { flex: 1, fontSize: 15, fontWeight: "600" },
  externalBtn: { padding: 6 },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  errorText: { fontSize: 14 },
  scrollView: { flex: 1 },
  content: { padding: 16, gap: 16 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4 },
  statusText: { fontSize: 12, fontWeight: "500" },
  dateText: { fontSize: 12 },
  bodyCard: {
    borderWidth: 0.5,
    borderRadius: 8,
    padding: 14,
  },
  bodyText: { fontSize: 13, lineHeight: 20 },
  commentsSection: { gap: 10 },
  commentHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  commentHeaderText: { fontSize: 12, fontWeight: "500" },
  commentCard: {
    borderWidth: 0.5,
    borderRadius: 8,
    padding: 12,
  },
  commentMeta: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
  commentAuthor: { fontSize: 12, fontWeight: "600" },
  commentDate: { fontSize: 11 },
  commentBody: { fontSize: 13, lineHeight: 19 },
  noComments: { alignItems: "center", paddingVertical: 20 },
  noCommentsText: { fontSize: 13 },
});
