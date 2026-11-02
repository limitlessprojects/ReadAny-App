import { useTheme } from "@/styles/theme";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { View } from "react-native";
import { AIPage } from "./steps/AIPage";
import { AppearancePage } from "./steps/AppearancePage";
import { CompletePage } from "./steps/CompletePage";
import { EmbeddingPage } from "./steps/EmbeddingPage";
import { SyncPage } from "./steps/SyncPage";
import { TranslationPage } from "./steps/TranslationPage";
import { WelcomePage } from "./steps/WelcomePage";

export type OnboardingStackParamList = {
  Welcome: undefined;
  Appearance: undefined;
  AI: undefined;
  Embedding: undefined;
  Translation: undefined;
  Sync: undefined;
  Complete: undefined;
};

const Stack = createNativeStackNavigator<OnboardingStackParamList>();

export function OnboardingNavigator() {
  const { colors } = useTheme();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: "slide_from_right",
          contentStyle: { backgroundColor: "transparent" },
        }}
      >
        <Stack.Screen name="Welcome" component={WelcomePage} />
        <Stack.Screen name="Appearance" component={AppearancePage} />
        <Stack.Screen name="AI" component={AIPage} />
        <Stack.Screen name="Embedding" component={EmbeddingPage} />
        <Stack.Screen name="Translation" component={TranslationPage} />
        <Stack.Screen name="Sync" component={SyncPage} />
        <Stack.Screen name="Complete" component={CompletePage} />
      </Stack.Navigator>
    </View>
  );
}
