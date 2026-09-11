#!/usr/bin/env node
// Sync semantic-release version to Tauri + Cargo + Android versionCode
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

function updateCargo(file) {
  const p = path.join(__dirname, "..", file);
  if (!fs.existsSync(p)) return;
  let s = fs.readFileSync(p, "utf8");
  s = s.replace(/^version = ".*"/m, `version = "${clean}"`);
  fs.writeFileSync(p, s);
  console.log(`updated ${file} -> ${clean}`);
}

// root package.json
updateJson("package.json", (j) => { j.version = clean; });
updateJson("native/windows/package.json", (j) => { j.version = clean; });
updateJson("native/android/package.json", (j) => { j.version = clean; });
updateJson("packages/shared-core/package.json", (j) => { j.version = clean; });

// tauri.conf.json
updateJson("native/windows/tauri.conf.json", (j) => { j.version = clean; });

// Cargo.toml
updateCargo("native/windows/src-tauri/Cargo.toml");

// optional: patch android versionCode via gradle if needed — we bump via git rev-list count
// keep capacitor.config.ts appVersion if present (not required)

console.log(`sync-versions done -> ${clean}`);
