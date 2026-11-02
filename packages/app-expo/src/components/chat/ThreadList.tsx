import { HistoryIcon, MessageCirclePlusIcon, Trash2Icon } from "@/components/ui/Icon";
import { fontSize as fs, fontWeight as fw, radius, useColors, withOpacity } from "@/styles/theme";
import type { ThemeColors } from "@/styles/theme";
import type { Thread } from "@readany/core/types";
/**
 * ThreadList — conversation thread list with create/delete/switch.
 */
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";

interface ThreadListProps {
  threads: Thread[];
  activeThreadId: string | null;
  onSelect: (threadId: string) => void;
  onCreate: () => void;
  onDelete: (threadId: string) => void;
}

export function ThreadList({
  threads,
  activeThreadId,
  onSelect,
  onCreate,
  onDelete,
}: ThreadListProps) {
  const { t } = useTranslation();
  const colors = useColors();
  const s = makeStyles(colors);

  const handleDelete = useCallback(
    (threadId: string) => {
      Alert.alert(
        t("chat.deleteThread", "删除对话"),
        t("chat.deleteThreadConfirm", "确定要删除这个对话吗？"),
        [
          { text: t("common.cancel", "取消"), style: "cancel" },
          {
            text: t("common.delete", "删除"),
            style: "destructive",
            onPress: () => onDelete(threadId),
          },
        ],
      );
    },
    [t, onDelete],
  );

  const formatTime = useCallback(
    (ts: number) => {
      const date = new Date(ts);
      const now = new Date();
      const diff = now.getTime() - date.getTime();
      if (diff < 60000) return t("chat.justNow", "刚刚");
      if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
      if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
      return date.toLocaleDateString();
    },
    [t],
  );

  const getPreview = useCallback(
    (thread: Thread) => {
      const lastMsg = thread.messages[thread.messages.length - 1];
      if (!lastMsg) return t("chat.noMessages", "暂无消息");
      return lastMsg.content?.slice(0, 60) || t("chat.noContent", "...");
    },
    [t],
  );

  const renderItem = useCallback(
    ({ item }: { item: Thread }) => {
      const isActive = item.id === activeThreadId;
      return (
        <TouchableOpacity
          style={[s.item, isActive && s.itemActive]}
          onPress={() => onSelect(item.id)}
          activeOpacity={0.7}
        >
          <View style={s.itemContent}>
            <View style={s.itemHeader}>
              <Text style={[s.itemTitle, isActive && s.itemTitleActive]} numberOfLines={1}>
                {item.title || t("chat.untitled", "新对话")}
              </Text>
              <Text style={s.itemTime}>{formatTime(item.updatedAt)}</Text>
            </View>
            <Text style={s.itemPreview} numberOfLines={1}>
              {getPreview(item)}
            </Text>
          </View>
          <TouchableOpacity
            style={s.deleteBtn}
            onPress={() => handleDelete(item.id)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Trash2Icon size={14} color={colors.mutedForeground} />
          </TouchableOpacity>
        </TouchableOpacity>
      );
    },
    [activeThreadId, colors, s, onSelect, handleDelete, formatTime, getPreview],
  );

  return (
    <View style={s.container}>
      <View style={s.header}>
        <View style={s.headerLeft}>
          <HistoryIcon size={16} color={colors.foreground} />
          <Text style={s.headerTitle}>{t("chat.threads", "对话列表")}</Text>
        </View>
        <TouchableOpacity style={s.newBtn} onPress={onCreate} activeOpacity={0.7}>
          <MessageCirclePlusIcon size={16} color={colors.primary} />
          <Text style={s.newBtnText}>{t("chat.newThread", "新对话")}</Text>
        </TouchableOpacity>
      </View>
      {threads.length === 0 ? (
        <View style={s.emptyWrap}>
          <Text style={s.emptyText}>{t("chat.noThreads", "还没有对话，点击上方创建")}</Text>
        </View>
      ) : (
        <FlatList
          data={threads}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ gap: 4 }}
        />
      )}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    container: { flex: 1 },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: 0.5,
      borderBottomColor: colors.border,
    },
    headerLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    headerTitle: {
      fontSize: fs.md,
      fontWeight: fw.semibold,
      color: colors.foreground,
    },
    newBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: radius.lg,
      backgroundColor: withOpacity(colors.primary, 0.1),
    },
    newBtnText: {
      fontSize: fs.xs,
      fontWeight: fw.medium,
      color: colors.primary,
    },
    item: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: radius.lg,
      marginHorizontal: 8,
    },
    itemActive: {
      backgroundColor: withOpacity(colors.primary, 0.08),
    },
    itemContent: { flex: 1, gap: 2 },
    itemHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    itemTitle: {
      fontSize: fs.sm,
      fontWeight: fw.medium,
      color: colors.foreground,
      flex: 1,
    },
    itemTitleActive: { color: colors.primary },
    itemTime: {
      fontSize: fs.xs,
      color: colors.mutedForeground,
      marginLeft: 8,
    },
    itemPreview: {
      fontSize: fs.xs,
      color: colors.mutedForeground,
    },
    deleteBtn: {
      marginLeft: 8,
      padding: 4,
    },
    emptyWrap: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 40,
    },
    emptyText: {
      fontSize: fs.sm,
      color: colors.mutedForeground,
      textAlign: "center",
    },
  });
