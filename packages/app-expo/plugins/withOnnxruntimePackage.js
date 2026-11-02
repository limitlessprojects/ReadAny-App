const { withDangerousMod, withMainApplication } = require("@expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");

const IMPORT = "import ai.onnxruntime.reactnative.OnnxruntimePackage";
const PACKAGE = "add(OnnxruntimePackage())";

/**
 * onnxruntime-react-native's bundled Expo plugin adds the Gradle dependency,
 * but does not add its legacy ReactPackage to RN's generated PackageList.
 * Register it in MainApplication so NativeModules.Onnxruntime is available.
 */
module.exports = function withOnnxruntimePackage(config) {
  config = withMainApplication(config, (cfg) => {
    if (cfg.modResults.language !== "kt") {
      throw new Error("withOnnxruntimePackage requires Kotlin MainApplication");
    }

    let source = cfg.modResults.contents;
    if (!source.includes(IMPORT)) {
      source = source.replace(
        "import android.content.res.Configuration",
        `import android.content.res.Configuration\n${IMPORT}`,
      );
    }
    if (!source.includes(PACKAGE)) {
      source = source.replace(
        "// add(MyReactNativePackage())",
        `// add(MyReactNativePackage())\n              ${PACKAGE}`,
      );
    }
    cfg.modResults.contents = source;
    return cfg;
  });

  // The package plugin hardcodes ../node_modules, but pnpm hoists dependencies
  // to the monorepo root, which is three levels above the iOS Podfile.
  return withDangerousMod(config, ["ios", (cfg) => {
    const podfilePath = path.join(cfg.modRequest.platformProjectRoot, "Podfile");
    const source = fs.readFileSync(podfilePath, "utf8");
    const fixedSource = source.replace(
      ":path => '../node_modules/onnxruntime-react-native'",
      ":path => '../../../node_modules/onnxruntime-react-native'",
    );
    if (fixedSource !== source) {
      fs.writeFileSync(podfilePath, fixedSource);
    }
    return cfg;
  }]);
};
