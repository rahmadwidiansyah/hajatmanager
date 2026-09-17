#!/usr/bin/env bash
# Rakit AppImage dari hasil `flutter build linux --release`.
# Dipakai di CI (release-assets.yml) dan bisa jalan lokal (butuh appimagetool).
# Usage: build-appimage.sh <bundle_dir> <desktop_file> <icon_png> <output_appimage>
set -euo pipefail

BUNDLE_DIR="${1:?bundle_dir (mobile/build/linux/x64/release/bundle)}"
DESKTOP_FILE="${2:?desktop file}"
ICON_PNG="${3:?icon png 512}"
OUTPUT="${4:?output .AppImage}"
APPIMAGETOOL="${APPIMAGETOOL:-$PWD/appimagetool-x86_64.AppImage}"

if [ ! -x "$APPIMAGETOOL" ]; then
  echo "-> unduh appimagetool"
  curl -fsSL -o "$APPIMAGETOOL" \
    https://github.com/AppImage/appimagetool/releases/download/continuous/appimagetool-x86_64.AppImage
  chmod +x "$APPIMAGETOOL"
fi

rm -rf AppDir
mkdir -p AppDir
cp -r "$BUNDLE_DIR"/* AppDir/
cp "$DESKTOP_FILE" AppDir/hajat-manager.desktop
cp "$ICON_PNG" AppDir/hajat-manager.png
cat > AppDir/AppRun <<'EOF'
#!/bin/sh
exec "$APPDIR/hajat_manager" "$@"
EOF
chmod +x AppDir/AppRun

ARCH=x86_64 "$APPIMAGETOOL" AppDir "$OUTPUT"
ls -lh "$OUTPUT"
