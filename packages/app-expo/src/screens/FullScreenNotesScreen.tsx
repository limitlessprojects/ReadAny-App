import { ChevronLeftIcon } from "@/components/ui/Icon";
import type { RootStackParamList } from "@/navigation/RootNavigator";
import { fontSize, fontWeight, useColors } from "@/styles/theme";
import { type RouteProp, useNavigation, useRoute } from "@react-navigation/native";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { NotesView } from "./NotesView";

export function FullScreenNotesScreen() {
  const colors = useColors();
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RootStackParamList, "FullScreenNotes">>();
  const { bookId } = route.params;
  const { t } = useTranslation();

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
      edges={["top", "bottom"]}
    >
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <ChevronLeftIcon size={24} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>
          {t("notes.title", "笔记")}
        </Text>
        <View style={{ width: 40 }} />
      </View>
      <NotesView initialBookId={bookId} showBackButton={false} edges={[]} hideDetailHeader />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 56,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  backBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
  },
});
