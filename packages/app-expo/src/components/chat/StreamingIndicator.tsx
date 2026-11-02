import { BrainIcon, Loader2Icon, WrenchIcon } from "@/components/ui/Icon";
import { fontSize as fs, fontWeight as fw, radius, useColors } from "@/styles/theme";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";

interface StreamingIndicatorProps {
  step: "thinking" | "tool_calling" | "responding";
}

export function StreamingIndicator({ step }: StreamingIndicatorProps) {
  const { t } = useTranslation();
  const colors = useColors();

  const getLabel = () => {
    switch (step) {
      case "thinking":
        return t("streaming.thinking", "正在思考...");
      case "tool_calling":
        return t("streaming.toolCalling", "正在调用工具...");
      case "responding":
        return t("streaming.responding", "正在回复...");
    }
  };

  const getIcon = () => {
    switch (step) {
      case "thinking":
        return <BrainIcon size={14} color={colors.primary} />;
      case "tool_calling":
        return <WrenchIcon size={14} color={colors.primary} />;
      case "responding":
        return <Loader2Icon size={14} color={colors.primary} />;
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.muted }]}>
      {getIcon()}
      <Text style={[styles.text, { color: colors.foreground }]}>{getLabel()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.lg,
    alignSelf: "flex-start",
  },
  text: {
    fontSize: fs.sm,
    fontWeight: fw.medium,
  },
});
