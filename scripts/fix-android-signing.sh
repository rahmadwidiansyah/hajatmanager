#!/bin/bash
# Fix APK "tidak valid" — patch android/app/build.gradle agar release selalu signed
# Dipanggil otomatis via `npm --prefix native/android run cap:sync` atau manual
set -e
GRADLE="native/android/android/app/build.gradle"
if [ ! -f "$GRADLE" ]; then
  echo "[fix-signing] $GRADLE not found, skip (run npx cap add android first)"
  exit 0
fi
if grep -q "v1SigningEnabled" "$GRADLE" && grep -q "signingConfigs.debug" "$GRADLE"; then
  echo "[fix-signing] already patched"
  exit 0
fi
echo "[fix-signing] patching $GRADLE ..."
python3 <<'PY'
import pathlib
p = pathlib.Path("native/android/android/app/build.gradle")
s = p.read_text()
# Patch signingConfigs.release v1/v2
if "v1SigningEnabled" not in s and "keystoreProperties" in s:
    s = s.replace(
        "                storePassword keystoreProperties['storePassword']",
        "                storePassword keystoreProperties['storePassword']\n                v1SigningEnabled true\n                v2SigningEnabled true"
    )
# Patch buildTypes fallback to debug
if "signingConfigs.debug" not in s:
    s = s.replace(
        "            if (keystorePropertiesFile.exists()) {\n                signingConfig signingConfigs.release\n            }",
        "            signingConfig keystorePropertiesFile.exists() ? signingConfigs.release : signingConfigs.debug"
    )
    if "signingConfigs.debug" not in s:
        # vanilla tanpa fallback
        s = s.replace(
            "            minifyEnabled false\n            proguardFiles",
            "            minifyEnabled false\n            proguardFiles getDefaultProguardFile('proguard-android.txt'), 'proguard-rules.pro'\n            signingConfig signingConfigs.debug"
        )
        # if above duplicate, clean
        s = s.replace(
            "            signingConfig signingConfigs.debug\n            proguardFiles getDefaultProguardFile",
            "            proguardFiles getDefaultProguardFile"
        )
        if "signingConfig keystorePropertiesFile.exists()" not in s:
            s = s.replace(
                "            minifyEnabled false",
                "            minifyEnabled false\n            signingConfig keystorePropertiesFile.exists() ? signingConfigs.release : signingConfigs.debug"
            )
p.write_text(s)
print("patched build.gradle for fallback debug signing")
PY
echo "[fix-signing] done"
cat "$GRADLE" | grep -A5 "signingConfig" | head -n 20
