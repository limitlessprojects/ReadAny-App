import { DarkModeSvg } from "@/components/DarkModeSvg";
import { KeyboardAwareScrollView } from "@/components/ui/KeyboardAwareScrollView";
import { useTheme } from "@/styles/theme";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { getPlatformService } from "@readany/core/services";
import { useSyncStore } from "@readany/core/stores/sync-store";
import { SYNC_SECRET_KEYS, type WebDavConfig } from "@readany/core/sync/sync-backend";
import { AlertCircle, CheckCircle2, Eye, EyeOff } from "lucide-react-native";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, { SlideInRight } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import CloudSvg from "../../../../assets/illustrations/deep_work.svg";
import type { OnboardingStackParamList } from "../OnboardingNavigator";

type NavProp = NativeStackNavigationProp<OnboardingStackParamList, "Sync">;

function isWebDavConfig(config: unknown): config is WebDavConfig {
  return (
    typeof config === "object" && config !== null && (config as WebDavConfig).type === "webdav"
  );
}

export function SyncPage() {
  const { t } = useTranslation();
  const navigation = useNavigation<NavProp>();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { config, loadConfig, saveWebDavConfig, testWebDavConnection } = useSyncStore();

  const [url, setUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remoteRoot, setRemoteRoot] = useState("readany");
  const [status, setStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [showPassword, setShowPassword] = useState(false);
  const [testError, setTestError] = useState("");

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    if (isWebDavConfig(config)) {
      if (config.url) setUrl(config.url);
      if (config.username) setUsername(config.username);
      if (config.remoteRoot) setRemoteRoot(config.remoteRoot);
    }

    const loadPassword = async () => {
      const platform = getPlatformService();
      const savedPassword = await platform.kvGetItem(SYNC_SECRET_KEYS.webdav);
      if (savedPassword) setPassword(savedPassword);
    };
    loadPassword();
  }, [config]);

  const handleTest = async () => {
    setStatus("testing");
    setTestError("");
    try {
      const ok = await testWebDavConnection(url, username, password, undefined, remoteRoot);
      setStatus(ok ? "success" : "error");
      if (!ok) setTestError(t("common.failed", "Failed"));
    } catch (error) {
      setStatus("error");
      setTestError(error instanceof Error ? error.message : String(error));
    }
  };

  const handleNext = async () => {
    if (url && username && password) {
      await saveWebDavConfig(url, username, password, undefined, remoteRoot);
    }
    navigation.navigate("Complete");
  };

  return (
    <View style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <Animated.View entering={SlideInRight.duration(500)} style={styles.container}>
        <KeyboardAwareScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <View
              style={[
                styles.iconContainer,
                { backgroundColor: "transparent", shadowOpacity: 0, width: "100%", height: 140 },
              ]}
            >
              <DarkModeSvg width={140} height={140}>
                <CloudSvg width={140} height={140} />
              </DarkModeSvg>
            </View>
            <Text style={[styles.title, { color: colors.foreground }]}>
              {t("onboarding.sync.title", "Cloud Sync")}
            </Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              {t(
                "onboarding.sync.desc",
                "Keep your progress perfectly in sync across devices using WebDAV.",
              )}
            </Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t("settings.webdavUrl", "WebDAV Server URL")}</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  color: colors.foreground,
                },
              ]}
              value={url}
              onChangeText={setUrl}
              placeholder="https://dav.jianguoyun.com/dav/"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t("settings.username", "Username")}</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  color: colors.foreground,
                },
              ]}
              value={username}
              onChangeText={setUsername}
              placeholder="name@example.com"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t("settings.password", "App Password")}</Text>
            <View
              style={[
                styles.inputContainer,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <TextInput
                style={[styles.inputWithIcon, { color: colors.foreground }]}
                value={password}
                onChangeText={setPassword}
                placeholder="your-app-password"
                placeholderTextColor={colors.mutedForeground}
                secureTextEntry={!showPassword}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Pressable onPress={() => setShowPassword(!showPassword)} style={styles.eyeIcon}>
                {showPassword ? (
                  <EyeOff size={20} color={colors.mutedForeground} />
                ) : (
                  <Eye size={20} color={colors.mutedForeground} />
                )}
              </Pressable>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{t("settings.syncRemoteRoot")}</Text>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                  color: colors.foreground,
                },
              ]}
              value={remoteRoot}
              onChangeText={setRemoteRoot}
              placeholder={t("settings.syncRemoteRootPlaceholder")}
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text
              style={{
                fontSize: 12,
                lineHeight: 18,
                color: colors.mutedForeground,
                marginTop: 8,
              }}
            >
              {t("settings.syncRemoteRootDesc")}
            </Text>
          </View>

          {status !== "idle" && (
            <View style={styles.statusRow}>
              {status === "testing" && <ActivityIndicator size="small" color={colors.primary} />}
              {status === "success" && <CheckCircle2 size={20} color="#10b981" />}
              {status === "error" && <AlertCircle size={20} color="#ef4444" />}
              <Text
                style={[
                  styles.statusText,
                  {
                    color:
                      status === "success"
                        ? "#10b981"
                        : status === "error"
                          ? "#ef4444"
                          : colors.mutedForeground,
                  },
                ]}
              >
                {status === "testing"
                  ? t("common.testing", "Testing...")
                  : status === "success"
                    ? t("common.success", "Success!")
                    : t("settings.syncTestFailed", {
                        error: testError || t("common.failed", "Failed"),
                      })}
              </Text>
            </View>
          )}

          <Pressable
            onPress={handleTest}
            style={[
              styles.testBtn,
              {
                borderColor: colors.primary,
                opacity: !url || !username || !password || status === "testing" ? 0.5 : 1,
              },
            ]}
            disabled={!url || !username || !password || status === "testing"}
          >
            <Text style={[styles.testBtnText, { color: colors.primary }]}>
              {t("settings.testConnection", "Test Connection")}
            </Text>
          </Pressable>
        </KeyboardAwareScrollView>

        <View
          style={[
            styles.footer,
            {
              backgroundColor: colors.background,
              borderTopColor: colors.border,
              paddingBottom: 16 + insets.bottom,
            },
          ]}
        >
          <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>{t("common.back", "Back")}</Text>
          </Pressable>
          <View style={styles.rightActions}>
            <Pressable
              onPress={() => navigation.navigate("Complete")}
              style={[styles.skipBtn, { opacity: 0.8 }]}
            >
              <Text style={[styles.skipText, { color: colors.mutedForeground }]}>
                {t("onboarding.skipForNow", "Skip for now")}
              </Text>
            </Pressable>
            <Pressable
              onPress={handleNext}
              disabled={status === "testing"}
              style={[
                styles.nextBtn,
                { backgroundColor: colors.primary, shadowColor: "transparent" },
              ]}
            >
              <Text style={[styles.nextText, { color: colors.primaryForeground }]}>
                {t("common.next", "Next")} →
              </Text>
            </Pressable>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f8fafc" },
  container: { flex: 1, flexDirection: "column" },
  scroll: { flex: 1 },
  scrollContent: { padding: 24 },
  header: { alignItems: "center", marginBottom: 32 },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: "#e0e7ff",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: "#0f172a",
    textAlign: "center",
    marginBottom: 8,
  },
  subtitle: { fontSize: 16, color: "#64748b", textAlign: "center" },
  section: { marginBottom: 24 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 12,
  },
  input: { padding: 16, borderRadius: 12, borderWidth: 2, fontSize: 16 },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 12,
    borderWidth: 2,
  },
  inputWithIcon: {
    flex: 1,
    padding: 16,
    fontSize: 16,
  },
  eyeIcon: {
    padding: 16,
  },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 16 },
  statusText: { fontSize: 14, fontWeight: "500" },
  testBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 999,
    borderWidth: 2,
    alignItems: "center",
  },
  testBtnText: { fontSize: 14, fontWeight: "600" },
  footer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 24,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
  },
  backBtn: { paddingVertical: 12, paddingHorizontal: 4 },
  backText: { fontSize: 16, color: "#64748b", fontWeight: "500" },
  rightActions: { flexDirection: "row", gap: 16, alignItems: "center" },
  skipBtn: { paddingVertical: 12 },
  skipText: { fontSize: 14, color: "#94a3b8", fontWeight: "500" },
  nextBtn: {
    backgroundColor: "#6366f1",
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 999,
  },
  nextText: { color: "#ffffff", fontSize: 16, fontWeight: "600" },
});
