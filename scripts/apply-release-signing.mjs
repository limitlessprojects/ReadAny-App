#!/usr/bin/env node
/**
 * Inject a real release signing config into the prebuild-generated
 * packages/app-expo/android/app/build.gradle.
 *
 * Expo prebuild regenerates android/ on every CI run, so signing cannot be
 * committed — it is applied here from CI env vars instead:
 *
 *   RELEASE_KEYSTORE_FILE       path to the .keystore (PKCS12)
 *   RELEASE_KEYSTORE_PASSWORD   store password
 *   RELEASE_KEY_ALIAS           key alias
 *   RELEASE_KEY_PASSWORD        key password (PKCS12: same as store)
 *
 * When RELEASE_KEYSTORE_FILE is unset/missing the script is a no-op and the
 * build keeps the template's debug keystore (previous behavior), so local
 * builds and forks without the secrets still work.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const gradlePath = process.argv[2] || "app/build.gradle";
const keystore = process.env.RELEASE_KEYSTORE_FILE || "";
const storePass = process.env.RELEASE_KEYSTORE_PASSWORD || "";
const alias = process.env.RELEASE_KEY_ALIAS || "readany-release";
const keyPass = process.env.RELEASE_KEY_PASSWORD || storePass;

if (!keystore || !existsSync(keystore)) {
  console.warn(
    "[apply-release-signing] no RELEASE_KEYSTORE_FILE provided — falling back to the debug keystore (NOT for release installs that must update in place)",
  );
  process.exit(0);
}
if (!storePass) {
  console.error(
    "[apply-release-signing] RELEASE_KEYSTORE_FILE set but RELEASE_KEYSTORE_PASSWORD missing",
  );
  process.exit(1);
}

let gradle = readFileSync(gradlePath, "utf8");

if (gradle.includes("signingConfigs.release")) {
  console.log("[apply-release-signing] already applied — skipping");
  process.exit(0);
}

// 1. Add the release signingConfig right after `signingConfigs {`.
const sigConfigsAnchor = "signingConfigs {";
if (!gradle.includes(sigConfigsAnchor)) {
  console.error("[apply-release-signing] could not find signingConfigs { in build.gradle");
  process.exit(1);
}
const releaseConfig = [
  "signingConfigs {",
  "        release {",
  `            storeFile file(${JSON.stringify(keystore)})`,
  `            storePassword ${JSON.stringify(storePass)}`,
  `            keyAlias ${JSON.stringify(alias)}`,
  `            keyPassword ${JSON.stringify(keyPass)}`,
  "        }",
].join("\n");
gradle = gradle.replace(sigConfigsAnchor, releaseConfig);

// 2. Point the release buildType at it. The debug buildType also says
//    `signingConfig signingConfigs.debug`, so only replace the occurrence
//    that appears inside the `release {` block.
const releaseBlockRe = /(buildTypes\s*\{\s*\n(?:[\s\S]*?)\n(\s*)release\s*\{)/;
const m = gradle.match(releaseBlockRe);
if (!m) {
  console.error("[apply-release-signing] could not locate the release buildType block");
  process.exit(1);
}
const releaseStart = m.index + m[1].length;
const releaseEnd = gradle.indexOf("}", releaseStart);
const releaseBlock = gradle.slice(releaseStart, releaseEnd);
if (!releaseBlock.includes("signingConfig signingConfigs.debug")) {
  console.error("[apply-release-signing] release block has no debug signingConfig to replace");
  process.exit(1);
}
gradle =
  gradle.slice(0, releaseStart) +
  releaseBlock.replace(
    "signingConfig signingConfigs.debug",
    "signingConfig signingConfigs.release",
  ) +
  gradle.slice(releaseEnd);

writeFileSync(gradlePath, gradle);
console.log(`[apply-release-signing] applied release keystore (${alias}) to ${gradlePath}`);
