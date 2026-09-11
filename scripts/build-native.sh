#!/bin/bash
set -e
echo "[native] Preparing NATIVE_BUILD (exclude API, patch pages)..."
# backup
[ -d "app/api" ] && mv app/api ./api.bak && echo "  moved app/api -> ./api.bak"
for f in app/dashboard/page.tsx app/account/page.tsx "app/events/[id]/page.tsx"; do
  if [ -f "$f" ]; then cp "$f" "$f.bak"; fi
done
cp scripts/native-patches/app/dashboard/page.tsx app/dashboard/page.tsx
cp scripts/native-patches/app/account/page.tsx app/account/page.tsx
cp "scripts/native-patches/app/events/[id]/page.tsx" "app/events/[id]/page.tsx"
echo "  patched pages for export"

echo "[native] Running NATIVE_BUILD=1 npm run build..."
NATIVE_BUILD=1 npm run build
CODE=$?

echo "[native] Restoring..."
[ -d "./api.bak" ] && mv ./api.bak app/api && echo "  restored app/api"
for f in app/dashboard/page.tsx app/account/page.tsx "app/events/[id]/page.tsx"; do
  [ -f "$f.bak" ] && mv "$f.bak" "$f" && echo "  restored $f"
done

if [ $CODE -ne 0 ]; then echo "[native] build failed with $CODE"; exit $CODE; fi
echo "[native] build-native done, out/ ready for Tauri/Capacitor"
ls -lh out 2>&1 | head -n 20
