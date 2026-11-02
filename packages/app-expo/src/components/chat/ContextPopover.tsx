import { BookOpenIcon, CheckIcon } from "@/components/ui/Icon";
import { useLibraryStore } from "@/stores/library-store";
import { fontSize as fs, fontWeight as fw, radius, useColors, withOpacity } from "@/styles/theme";
import type { ThemeColors } from "@/styles/theme";
import { useChatReaderStore } from "@readany/core/stores";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export function ContextPopover() {
  const [visible, setVisible] = useState(false);
  const { t } = useTranslation();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const books = useLibraryStore((st) => st.books);
  const selectedBooks = useChatReaderStore((st) => st.selectedBooks);
  const addSelectedBook = useChatReaderStore((st) => st.addSelectedBook);
  const removeSelectedBook = useChatReaderStore((st) => st.removeSelectedBook);

  const count = selectedBooks.length;

  return (
    <>
      <TouchableOpacity style={s.trigger} onPress={() => setVisible(true)} activeOpacity={0.7}>
        <BookOpenIcon size={16} color={colors.foreground} />
        {count > 0 && (
          <View style={s.badge}>
            <Text style={s.badgeText}>{count}</Text>
          </View>
        )}
      </TouchableOpacity>

      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={() => setVisible(false)}
      >
        <Pressable style={s.overlay} onPress={() => setVisible(false)} />
        <View style={s.sheet}>
          <View style={s.handle} />
          <Text style={s.title}>{t("chat.selectBooks", "选择书籍上下文")}</Text>

          {books.length === 0 ? (
            <View style={s.emptyWrap}>
              <Text style={s.emptyText}>{t("library.empty", "暂无书籍")}</Text>
            </View>
          ) : (
            <ScrollView style={s.list} showsVerticalScrollIndicator={false}>
              {books.map((book) => {
                const isSelected = selectedBooks.includes(book.id);
                return (
                  <TouchableOpacity
                    key={book.id}
                    style={s.bookItem}
                    onPress={() => {
                      if (isSelected) removeSelectedBook(book.id);
                      else addSelectedBook(book.id);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={s.bookInfo}>
                      <Text style={s.bookTitle} numberOfLines={1}>
                        {book.meta.title}
                      </Text>
                      {book.meta.author && (
                        <Text style={s.bookAuthor} numberOfLines={1}>
                          {book.meta.author}
                        </Text>
                      )}
                    </View>
                    <View style={[s.checkbox, isSelected && s.checkboxActive]}>
                      {isSelected && <CheckIcon size={12} color={colors.primaryForeground} />}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>
      </Modal>
    </>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    trigger: {
      width: 32,
      height: 32,
      borderRadius: radius.full,
      alignItems: "center",
      justifyContent: "center",
      position: "relative",
    },
    badge: {
      position: "absolute",
      top: 2,
      right: 2,
      minWidth: 14,
      height: 14,
      borderRadius: 7,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 3,
    },
    badgeText: {
      fontSize: 9,
      fontWeight: fw.bold,
      color: colors.primaryForeground,
    },
    overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
    sheet: {
      backgroundColor: colors.background,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      paddingBottom: 34,
      maxHeight: "60%",
    },
    handle: {
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.muted,
      alignSelf: "center",
      marginTop: 12,
      marginBottom: 8,
    },
    title: {
      fontSize: fs.md,
      fontWeight: fw.semibold,
      color: colors.foreground,
      paddingHorizontal: 20,
      marginBottom: 8,
    },
    emptyWrap: {
      paddingVertical: 40,
      alignItems: "center",
    },
    emptyText: {
      fontSize: fs.sm,
      color: colors.mutedForeground,
    },
    list: { paddingHorizontal: 8 },
    bookItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: radius.lg,
    },
    bookInfo: { flex: 1, minWidth: 0, gap: 2 },
    bookTitle: {
      fontSize: fs.sm,
      fontWeight: fw.medium,
      color: colors.foreground,
    },
    bookAuthor: {
      fontSize: fs.xs,
      color: colors.mutedForeground,
    },
    checkbox: {
      width: 20,
      height: 20,
      borderRadius: 4,
      borderWidth: 2,
      borderColor: withOpacity(colors.mutedForeground, 0.4),
      alignItems: "center",
      justifyContent: "center",
    },
    checkboxActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primary,
    },
  });
