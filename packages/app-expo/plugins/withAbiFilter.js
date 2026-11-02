const { withGradleProperties, withDangerousMod } = require("@expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");

/**
 * Restrict the release APK to arm64-v8a.
 *
 * The universal APK used to carry x86, x86_64 and armeabi-v7a native libs
 * (onnxruntime alone is ~150MB across 4 ABIs) even though every phone that
 * can sideload this demo is arm64. Emulators only matter for local dev, so
 * the development variant keeps all ABIs.
 *
 * Two layers needed:
 *  - reactNativeArchitectures gradle property: filters libs built from
 *    source (react-native, onnxruntime, expo-sqlite, reanimated, ...).
 *  - ndk { abiFilters } in defaultConfig: strips prebuilt AARs that ship
 *    every ABI regardless (e.g. ML Kit's libbarhopper_v3.so).
 */
const ABI = "arm64-v8a";

module.exports = function withAbiFilter(baseConfig) {
  let config = withGradleProperties(baseConfig, (cfg) => {
    const props = cfg.modResults;
    const existing = props.find(
      (p) => p.type === "property" && p.key === "reactNativeArchitectures",
    );
    if (existing) {
      existing.value = ABI;
    } else {
      props.push({ type: "property", key: "reactNativeArchitectures", value: ABI });
    }
    return cfg;
  });

  config = withDangerousMod(config, [
    "android",
    (cfg) => {
      const gradlePath = path.join(cfg.modRequest.platformProjectRoot, "app", "build.gradle");
      let source = fs.readFileSync(gradlePath, "utf8");
      if (!source.includes("abiFilters")) {
        source = source.replace(
          /defaultConfig\s*\{/,
          `defaultConfig {\n        ndk { abiFilters "${ABI}" }`,
        );
        fs.writeFileSync(gradlePath, source);
      }
      return cfg;
    },
  ]);

  return config;
};
