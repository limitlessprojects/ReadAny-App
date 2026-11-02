import { CheckIcon, ChevronDownIcon } from "@/components/ui/Icon";
import { useSettingsStore } from "@/stores/settings-store";
import { fontSize as fs, fontWeight as fw, radius, useColors, withOpacity } from "@/styles/theme";
import type { ThemeColors } from "@/styles/theme";
/**
 * ModelSelector — compact pill trigger with popover dropdown.
 * Matches app-mobile MobileModelSelector style.
 */
import { useCallback, useMemo, useState } from "react";
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

interface ModelSelectorProps {
  onNavigateToSettings?: () => void;
}

export function ModelSelector({ onNavigateToSettings }: ModelSelectorProps) {
  const [visible, setVisible] = useState(false);
  const { t } = useTranslation();
  const colors = useColors();
  const s = useMemo(() => makeStyles(colors), [colors]);

  const aiConfig = useSettingsStore((st) => st.aiConfig);
  const setActiveEndpoint = useSettingsStore((st) => st.setActiveEndpoint);
  const setActiveModel = useSettingsStore((st) => st.setActiveModel);

  const endpointsWithModels = aiConfig.endpoints.filter((ep) => ep.models.length > 0);
  const totalModels = endpointsWithModels.reduce((sum, ep) => sum + ep.models.length, 0);
  const canSwitch = totalModels >= 1;

  const displayName = aiConfig.activeModel || t("chat.currentModel", "模型");

  const handleSelect = useCallback(
    (endpointId: string, model: string) => {
      setActiveEndpoint(endpointId);
      setActiveModel(model);
      setVisible(false);
    },
    [setActiveEndpoint, setActiveModel],
  );

  if (aiConfig.endpoints.length === 0) {
    return (
      <TouchableOpacity style={s.trigger} onPress={onNavigateToSettings} activeOpacity={0.7}>
        <Text style={[s.triggerText, { color: colors.amber }]}>
          {t("chat.configureAI", "配置 AI")}
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <>
      <TouchableOpacity
        style={s.trigger}
        onPress={() => canSwitch && setVisible(true)}
        activeOpacity={canSwitch ? 0.7 : 1}
      >
        <Text style={s.triggerText} numberOfLines={1}>
          {displayName}
        </Text>
        {canSwitch && <ChevronDownIcon size={10} color={colors.mutedForeground} />}
      </TouchableOpacity>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <Pressable style={s.backdrop} onPress={() => setVisible(false)}>
          <View style={s.popover}>
            <ScrollView style={s.popoverScroll} showsVerticalScrollIndicator={false}>
              {endpointsWithModels.map((ep) => (
                <View key={ep.id}>
                  {endpointsWithModels.length > 1 && (
                    <Text style={s.epName}>{ep.name || ep.baseUrl}</Text>
                  )}
                  {ep.models.map((model) => {
                    const isActive =
                      ep.id === aiConfig.activeEndpointId && model === aiConfig.activeModel;
                    return (
                      <TouchableOpacity
                        key={`${ep.id}-${model}`}
                        style={[s.modelItem, isActive && s.modelItemActive]}
                        onPress={() => handleSelect(ep.id, model)}
                        activeOpacity={0.7}
                      >
                        <Text
                          style={[s.modelText, isActive && s.modelTextActive]}
                          numberOfLines={1}
                        >
                          {model}
                        </Text>
                        {isActive && <CheckIcon size={12} color={colors.primary} />}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const makeStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    trigger: {
      flexDirection: "row",
      alignItems: "center",
      gap: 3,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: radius.full,
      borderWidth: 1,
      borderColor: colors.border,
      maxWidth: 120,
    },
    triggerText: {
      fontSize: fs.xs,
      color: colors.mutedForeground,
      flexShrink: 1,
    },
    backdrop: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.15)",
      justifyContent: "flex-start",
      alignItems: "flex-end",
      paddingTop: 100,
      paddingRight: 12,
    },
    popover: {
      width: 224,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      padding: 4,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
      elevation: 8,
    },
    popoverScroll: {
      maxHeight: 288,
    },
    epName: {
      fontSize: 9,
      fontWeight: fw.medium,
      color: colors.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      paddingHorizontal: 10,
      paddingTop: 8,
      paddingBottom: 2,
    },
    modelItem: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: radius.md,
    },
    modelItemActive: {
      backgroundColor: withOpacity(colors.primary, 0.08),
    },
    modelText: {
      fontSize: fs.xs,
      color: colors.foreground,
      flex: 1,
    },
    modelTextActive: {
      color: colors.primary,
      fontWeight: fw.medium,
    },
  });
