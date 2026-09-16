#!/usr/bin/env node
// Sync semantic-release version to web + Flutter (native Capacitor/Tauri dihapus)
const fs = require("fs");
const path = require("path");

const version = process.argv[2];
if (!version) {
  console.error("Usage: node scripts/sync-versions.js <version>");
  process.exit(1);
}
const clean = version.replace(/^v/, "");

function updateJson(file, updater) {
  const p = path.join(__dirname, "..", file);
  if (!fs.existsSync(p)) return console.warn(`skip ${file} not found`);
  const j = JSON.parse(fs.readFileSync(p, "utf8"));
  updater(j);
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + "\n");
  console.log(`updated ${file} -> ${clean}`);
}

// root package.json
updateJson("package.json", (j) => { j.version = clean; });
updateJson("packages/shared-core/package.json", (j) => { j.version = clean; });

// mobile/pubspec.yaml — version: x.y.z+N (N = GITHUB_RUN_NUMBER agar naik tiap rilis)
(function updatePubspec() {
  const p = path.join(__dirname, "..", "mobile", "pubspec.yaml");
  if (!fs.existsSync(p)) return console.warn("skip mobile/pubspec.yaml not found");
  const build = process.env.GITHUB_RUN_NUMBER || "1";
  let s = fs.readFileSync(p, "utf8");
  if (/^version:\s*.*$/m.test(s)) {
    s = s.replace(/^version:\s*.*$/m, `version: ${clean}+${build}`);
  } else {
    s = `version: ${clean}+${build}\n` + s;
  }
  fs.writeFileSync(p, s);
  console.log(`updated mobile/pubspec.yaml -> ${clean}+${build}`);
})();

console.log(`sync-versions done -> ${clean}`);
