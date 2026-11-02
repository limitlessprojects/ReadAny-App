/**
 * Split monolithic locale JSON files into per-module files organized in per-language folders.
 * Run: node packages/core/scripts/split-locales.js
 */
const fs = require("fs");
const path = require("path");

const LOCALES_DIR = path.resolve(__dirname, "../src/i18n/locales");
const LANGUAGES = ["en", "zh", "ja", "ko", "fr", "es"];

const MODULE_MAP = {
  "common.json": ["common", "sidebar", "tabs", "window"],
  "library.json": ["library", "home"],
  "reader.json": ["reader", "bookmarks", "highlights", "notebook", "editor"],
  "chat.json": ["chat", "streaming", "toolLabels", "mindmap", "mermaid"],
  "notes.json": ["notes"],
  "settings.json": ["settings"],
  "translation.json": ["translation"],
  "tts.json": ["tts", "fonts"],
  "stats.json": ["stats"],
  "onboarding.json": ["onboarding", "tour", "readerTour", "commandPalette", "updater"],
  "profile.json": ["profile", "skills", "about", "feedback"],
  "misc.json": ["vectorize"],
};

for (const lang of LANGUAGES) {
  const srcFile = path.join(LOCALES_DIR, `${lang}.json`);
  if (!fs.existsSync(srcFile)) {
    console.warn(`Skipping ${lang}: file not found`);
    continue;
  }

  const data = JSON.parse(fs.readFileSync(srcFile, "utf8"));
  const langDir = path.join(LOCALES_DIR, lang);
  fs.mkdirSync(langDir, { recursive: true });

  let totalKeys = 0;

  for (const [moduleFile, sections] of Object.entries(MODULE_MAP)) {
    const moduleData = {};
    for (const section of sections) {
      if (data[section] !== undefined) {
        moduleData[section] = data[section];
        totalKeys += JSON.stringify(data[section]).match(/"[^"]+"\s*:/g)?.length || 0;
      }
    }
    const outPath = path.join(langDir, moduleFile);
    fs.writeFileSync(outPath, JSON.stringify(moduleData, null, 2) + "\n");
  }

  console.log(`${lang}: split into ${Object.keys(MODULE_MAP).length} files (${totalKeys} key references)`);
}

// Verify no sections were missed
const enData = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, "en.json"), "utf8"));
const allMappedSections = Object.values(MODULE_MAP).flat();
const unmapped = Object.keys(enData).filter((k) => !allMappedSections.includes(k));
if (unmapped.length > 0) {
  console.error("WARNING: Unmapped sections:", unmapped);
  process.exit(1);
} else {
  console.log("\n✓ All sections mapped. Safe to delete old files.");
}
