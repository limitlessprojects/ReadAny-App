const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const VERSION = "1.1.8";

const FILES = [
  { f: "packages/app/package.json", key: "version" },
  { f: "packages/app/src-tauri/tauri.conf.json", key: "version" },
  { f: "packages/app-expo/package.json", key: "version" },
  { f: "packages/app-expo/app.json", key: "expo.version" },
];

const cargoPath = path.join(ROOT, "packages/app/src-tauri/Cargo.toml");
let cargo = fs.readFileSync(cargoPath, "utf8");
cargo = cargo.replace(/^version = "[^"]+"$/m, `version = "${VERSION}"`);
fs.writeFileSync(cargoPath, cargo, "utf8");
console.log(`Updated Cargo.toml -> ${VERSION}`);

for (const { f, key } of FILES) {
  const fp = path.join(ROOT, f);
  const content = JSON.parse(fs.readFileSync(fp, "utf8"));
  if (key.includes(".")) {
    const [k, sub] = key.split(".");
    content[k][sub] = VERSION;
  } else {
    content[key] = VERSION;
  }
  fs.writeFileSync(fp, JSON.stringify(content, null, 2) + "\n", "utf8");
  console.log(`Updated ${f} -> ${VERSION}`);
}
console.log(`\nAll versions synced to ${VERSION}`);
