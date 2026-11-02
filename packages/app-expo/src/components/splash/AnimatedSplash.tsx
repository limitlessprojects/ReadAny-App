/**
 * AnimatedSplash — animated splash screen.
 *
 * Animation sequence:
 * 1. Logo fades in + floats up from below
 * 2. Continuous gentle float (loop)
 * 3. Book does a subtle page-turn tilt
 * 4. App name fades in below
 * 5. Everything fades out to reveal the app
 */
import { useCallback, useEffect } from "react";
import { Dimensions, Image, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";

const { width: SCREEN_W } = Dimensions.get("window");
const LOGO_SIZE = Math.min(SCREEN_W * 0.42, 180);
const BG_COLOR = "#05042B";

interface Props {
  onFinish: () => void;
}

export function AnimatedSplash({ onFinish }: Props) {
  // ─── Shared values ───
  const ghostY = useSharedValue(60);
  const ghostOpacity = useSharedValue(0);
  const ghostFloat = useSharedValue(0);
  const bookTilt = useSharedValue(0);
  const titleOpacity = useSharedValue(0);
  const containerOpacity = useSharedValue(1);

  const handleFinish = useCallback(() => {
    onFinish();
  }, [onFinish]);

  useEffect(() => {
    // 1. Logo floats up and fades in quickly; keep the brand moment, but don't
    // make returning users wait on startup.
    ghostOpacity.value = withTiming(1, { duration: 360 });
    ghostY.value = withSpring(0, { damping: 14, stiffness: 120 });

    // 2. Continuous gentle float (loop)
    ghostFloat.value = withDelay(
      360,
      withRepeat(
        withSequence(
          withTiming(-8, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
          withTiming(8, { duration: 1500, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        true,
      ),
    );

    // 3. Book tilt (subtle page-turn)
    bookTilt.value = withDelay(
      520,
      withRepeat(
        withSequence(
          withTiming(-3, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
          withTiming(3, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        true,
      ),
    );

    // 4. Title fades in
    titleOpacity.value = withDelay(420, withTiming(1, { duration: 320 }));

    // 5. Fade out sooner so app content is ready without a long logo linger.
    const timer = setTimeout(() => {
      containerOpacity.value = withTiming(0, { duration: 220 }, (finished) => {
        if (finished) runOnJS(handleFinish)();
      });
    }, 1050);

    return () => {
      clearTimeout(timer);
      cancelAnimation(ghostFloat);
      cancelAnimation(bookTilt);
    };
  }, []);

  // ─── Animated styles ───

  const containerStyle = useAnimatedStyle(() => ({
    opacity: containerOpacity.value,
  }));

  const ghostStyle = useAnimatedStyle(() => ({
    opacity: ghostOpacity.value,
    transform: [{ translateY: ghostY.value + ghostFloat.value }],
  }));

  const bookStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${bookTilt.value}deg` }],
  }));

  const titleStyle = useAnimatedStyle(() => ({
    opacity: titleOpacity.value,
    transform: [
      {
        translateY: interpolate(titleOpacity.value, [0, 1], [10, 0]),
      },
    ],
  }));

  return (
    <Animated.View style={[styles.container, containerStyle]}>
      <View style={styles.ghostArea}>
        {/* Logo with book tilt */}
        <Animated.View style={ghostStyle}>
          <Animated.View style={bookStyle}>
            <Image
              source={require("../../../assets/splash-icon.png")}
              style={{ width: LOGO_SIZE, height: LOGO_SIZE, borderRadius: LOGO_SIZE * 0.18 }}
              resizeMode="contain"
            />
          </Animated.View>
        </Animated.View>
      </View>

      {/* Title */}
      <Animated.Text style={[styles.title, titleStyle]}>ReadAny</Animated.Text>
      <Animated.Text style={[styles.subtitle, titleStyle]}>Read Any, Understand More</Animated.Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: BG_COLOR,
    justifyContent: "center",
    alignItems: "center",
    zIndex: 9999,
  },
  ghostArea: {
    width: LOGO_SIZE * 2,
    height: LOGO_SIZE * 1.6,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    marginTop: 24,
    fontSize: 28,
    fontWeight: "700",
    color: "#F5F5F7",
    letterSpacing: 1.5,
  },
  subtitle: {
    marginTop: 6,
    fontSize: 13,
    color: "rgba(245, 245, 247, 0.5)",
    letterSpacing: 0.5,
  },
});
