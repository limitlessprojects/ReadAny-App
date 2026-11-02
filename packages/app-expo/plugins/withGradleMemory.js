const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("node:fs");
const path = require("node:path");

const GRADLE_JVM_ARGS = "org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m";

module.exports = function withGradleMemory(config) {
  return withDangerousMod(config, ["android", (cfg) => {
    const gradlePropertiesPath = path.join(
      cfg.modRequest.platformProjectRoot,
      "gradle.properties",
    );
    const source = fs.existsSync(gradlePropertiesPath)
      ? fs.readFileSync(gradlePropertiesPath, "utf8")
      : "";
    const lines = source.split(/\r?\n/);
    const existingIndex = lines.findIndex((line) => /^\s*org\.gradle\.jvmargs\s*=/.test(line));

    if (existingIndex >= 0) {
      lines[existingIndex] = GRADLE_JVM_ARGS;
    } else {
      lines.push(GRADLE_JVM_ARGS);
    }

    fs.writeFileSync(gradlePropertiesPath, lines.join("\n"));
    return cfg;
  }]);
};
