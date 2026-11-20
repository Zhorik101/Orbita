#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
: "${ANDROID_BUILD_TOOLS:?Set path to Android SDK Build Tools}"
: "${ORBITA_KEYSTORE:?Set path to the Orbita signing keystore}"
gradle="${ORBITA_GRADLE:-gradle}"
"$gradle" --no-daemon assembleRelease "$@"
"$ANDROID_BUILD_TOOLS/zipalign" -f -p 4 build/outputs/apk/release/Orbita-release-unsigned.apk build/aligned.apk
"$ANDROID_BUILD_TOOLS/apksigner" sign --ks "$ORBITA_KEYSTORE" --ks-key-alias orbita --out build/orbita.apk build/aligned.apk
"$ANDROID_BUILD_TOOLS/apksigner" verify --verbose build/orbita.apk
