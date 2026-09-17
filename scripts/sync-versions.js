#!/usr/bin/env node
// Sync semantic-release version ke: package.json, csproj (WPF),
// hajat-manager.iss (Setup.exe), PKGBUILD (AUR), mobile/pubspec.yaml.
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

// windows .NET WPF — <Version>x.y.z</Version> di csproj
(function updateCsproj() {
  const p = path.join(__dirname, "..", "windows", "src", "HajatManager", "HajatManager.csproj");
  if (!fs.existsSync(p)) return console.warn("skip HajatManager.csproj not found");
  let s = fs.readFileSync(p, "utf8");
  if (/<Version>.*<\/Version>/.test(s)) {
    s = s.replace(/<Version>.*<\/Version>/, `<Version>${clean}</Version>`);
  } else {
    s = s.replace(/<PropertyGroup>/, `<PropertyGroup>\n    <Version>${clean}</Version>`);
  }
  fs.writeFileSync(p, s);
  console.log(`updated HajatManager.csproj -> ${clean}`);
})();

// windows installer — #define MyAppVersion "x.y.z" di .iss
(function updateIss() {
  const p = path.join(__dirname, "..", "windows", "installer", "hajat-manager.iss");
  if (!fs.existsSync(p)) return console.warn("skip hajat-manager.iss not found");
  let s = fs.readFileSync(p, "utf8");
  s = s.replace(/^#define MyAppVersion ".*"$/m, `#define MyAppVersion "${clean}"`);
  fs.writeFileSync(p, s);
  console.log(`updated hajat-manager.iss -> ${clean}`);
})();

// linux AUR — pkgver=x.y.z di PKGBUILD
(function updatePkgbuild() {
  const p = path.join(__dirname, "..", "packaging", "linux", "PKGBUILD");
  if (!fs.existsSync(p)) return console.warn("skip packaging/linux/PKGBUILD not found");
  let s = fs.readFileSync(p, "utf8");
  s = s.replace(/^pkgver=.*$/m, `pkgver=${clean}`);
  fs.writeFileSync(p, s);
  console.log(`updated packaging/linux/PKGBUILD -> ${clean}`);
})();

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
