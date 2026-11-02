const fs = require("node:fs");
const path = require("node:path");
const { getAppVariantConfig } = require("./app-variant");

const appRoot = path.resolve(__dirname, "..");
const iosRoot = path.join(appRoot, "ios");

function findIosNativePaths() {
  if (!fs.existsSync(iosRoot)) {
    return null;
  }

  const projectEntry = fs.readdirSync(iosRoot, { withFileTypes: true }).find(
    (entry) => entry.isDirectory() && entry.name.endsWith(".xcodeproj"),
  );
  if (!projectEntry) {
    return null;
  }

  const projectName = projectEntry.name.slice(0, -".xcodeproj".length);
  return {
    projectPath: path.join(iosRoot, projectEntry.name, "project.pbxproj"),
    infoPlistPath: path.join(iosRoot, projectName, "Info.plist"),
  };
}

function replaceAll(content, pattern, replacement) {
  pattern.lastIndex = 0;
  if (!pattern.test(content)) {
    throw new Error(`Unable to apply native variant replacement: ${pattern}`);
  }
  pattern.lastIndex = 0;
  return content.replace(pattern, replacement);
}

function syncIosProject(variant, iosProjectPath) {
  if (!fs.existsSync(iosProjectPath)) {
    return false;
  }

  let project = fs.readFileSync(iosProjectPath, "utf8");
  project = replaceAll(
    project,
    /PRODUCT_BUNDLE_IDENTIFIER = ("[^"]+"|[^;]+);/g,
    `PRODUCT_BUNDLE_IDENTIFIER = "${variant.bundleIdentifier}";`,
  );
  project = replaceAll(
    project,
    /PRODUCT_NAME = ("[^"]+"|[^;]+);/g,
    `PRODUCT_NAME = "${variant.name}";`,
  );
  fs.writeFileSync(iosProjectPath, project);
  return true;
}

function syncIosInfoPlist(variant, iosInfoPlistPath) {
  if (!fs.existsSync(iosInfoPlistPath)) {
    return false;
  }

  let plist = fs.readFileSync(iosInfoPlistPath, "utf8");
  plist = replaceAll(
    plist,
    /(<key>CFBundleDisplayName<\/key>\s*<string>)[^<]+(<\/string>)/,
    `$1${variant.name}$2`,
  );
  plist = replaceAll(
    plist,
    /<string>readany(?:-(?:dev|preview))?<\/string>/g,
    `<string>${variant.scheme}</string>`,
  );
  plist = replaceAll(
    plist,
    /<string>com\.readany\.app(?:\.(?:dev|preview))?<\/string>/g,
    `<string>${variant.bundleIdentifier}</string>`,
  );
  plist = replaceAll(
    plist,
    /<string>exp\+readany(?:-(?:dev|preview))?<\/string>/g,
    `<string>exp+${variant.scheme}</string>`,
  );
  fs.writeFileSync(iosInfoPlistPath, plist);
  return true;
}

function main() {
  const variant = getAppVariantConfig();
  const nativePaths = findIosNativePaths();
  const syncedProject = nativePaths
    ? syncIosProject(variant, nativePaths.projectPath)
    : false;
  const syncedInfoPlist = nativePaths
    ? syncIosInfoPlist(variant, nativePaths.infoPlistPath)
    : false;

  if (syncedProject || syncedInfoPlist) {
    console.log(`Synced iOS native variant: ${variant.key} (${variant.bundleIdentifier})`);
  } else {
    console.log("No iOS native project found; Expo config will provide variants.");
  }
}

main();
