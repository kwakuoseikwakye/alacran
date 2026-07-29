#!/bin/bash
# Package the control-panel as a double-clickable macOS browser-runner app.
#
# Produces dist/<APP_NAME>.app — a self-contained Next.js standalone server
# that, on launch, starts the production server locally and opens the user's
# default browser to it. Requires the end user to have Node.js on their PATH
# (the v1 audience is CLI-comfortable early adopters who already have it, since
# Claude Code CLI needs Node too). If Node is missing, the launcher shows a
# guided alert instead of failing silently.
#
# Also produces dist/<APP_NAME>.dmg — a standard drag-to-Applications disk
# image, built with hdiutil (no extra dependencies). NOTE: this app is
# UNSIGNED. The .dmg gives the familiar install gesture, but Gatekeeper will
# still show a "cannot verify / may harm your Mac" warning on first launch
# regardless of .dmg vs .zip — only a paid Apple Developer Program
# enrollment + `codesign`/`notarytool` removes that warning. That's a
# separate, not-yet-done step (see LAUNCH.md).
#
# Usage:  bash scripts/package-macos.sh [--no-selftest]
#
# The app name and default port are the two knobs; change APP_NAME once a
# final product name is chosen (LAUNCH.md open decision).

set -euo pipefail

APP_NAME="Alacrán"             # scorpion — final product name (keep in sync with lib/branding.ts)
DEFAULT_PORT="4319"             # uncommon default to avoid collisions

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

DIST="$REPO_ROOT/dist"
APP="$DIST/$APP_NAME.app"
PAYLOAD="$APP/Contents/Resources/app"

RUN_SELFTEST="1"
[ "${1:-}" = "--no-selftest" ] && RUN_SELFTEST="0"

echo "==> Building the production standalone server"
npm run build

if [ ! -f ".next/standalone/server.js" ]; then
  echo "ERROR: .next/standalone/server.js not found — is output:'standalone' set in next.config.ts?" >&2
  exit 1
fi

echo "==> Assembling the app payload"
rm -rf "$APP"
mkdir -p "$PAYLOAD" "$APP/Contents/MacOS"

# Standalone server + its traced node_modules + package.json
cp -R .next/standalone/. "$PAYLOAD/"
# Static assets and the bundled company template (standalone doesn't include these)
mkdir -p "$PAYLOAD/.next"
cp -R .next/static "$PAYLOAD/.next/static"
cp -R templates "$PAYLOAD/templates"

echo "==> Writing the launcher"
LAUNCHER="$APP/Contents/MacOS/launcher"
cat > "$LAUNCHER" <<LAUNCH
#!/bin/bash
# Double-click launcher: start the local server, open the browser.
APP_DIR="\$(cd "\$(dirname "\$0")/../Resources/app" && pwd)"

# Ensure common CLI install locations are on PATH so a GUI-launched app can
# still find node, and so the app's own spawned 'claude'/'gog' resolve.
export PATH="/opt/homebrew/bin:/usr/local/bin:\$HOME/.local/bin:\$HOME/.npm-global/bin:\$PATH"

NODE_BIN="\$(command -v node || true)"
if [ -z "\$NODE_BIN" ]; then
  osascript -e 'display alert "Node.js is required" message "Please install Node.js (nodejs.org) and then reopen this app."'
  exit 1
fi

PORT="\${PORT:-$DEFAULT_PORT}"
export PORT
export HOSTNAME="127.0.0.1"

cd "\$APP_DIR"
"\$NODE_BIN" server.js &
SERVER_PID=\$!

# Wait for the server to answer, then open the browser.
for i in \$(seq 1 40); do
  if curl -s -o /dev/null "http://127.0.0.1:\$PORT/"; then break; fi
  sleep 0.25
done
open "http://127.0.0.1:\$PORT/"

wait \$SERVER_PID
LAUNCH
chmod +x "$LAUNCHER"

echo "==> Writing Info.plist"
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>$APP_NAME</string>
  <key>CFBundleDisplayName</key><string>$APP_NAME</string>
  <key>CFBundleIdentifier</key><string>app.alacran.desktop</string>
  <key>CFBundleVersion</key><string>0.1.0</string>
  <key>CFBundleShortVersionString</key><string>0.1.0</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>launcher</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>LSUIElement</key><false/>
</dict>
</plist>
PLIST

echo "==> Built: $APP"

# Ad-hoc sign (no Apple Developer account, no identity — signs with '-').
# This does NOT remove Gatekeeper's "unidentified developer" warning (only a
# real Developer ID signature + notarization does that), but a COMPLETELY
# unsigned bundle can trip a stricter Gatekeeper path on current macOS that
# reports the app as "damaged" with no override at all in System Settings.
# An ad-hoc signature gives the bundle a valid signing structure so Gatekeeper
# falls back to the milder "unidentified developer" prompt, which DOES have
# an "Open Anyway" override in System Settings > Privacy & Security.
echo "==> Ad-hoc signing (no Apple Developer identity — does not remove the Gatekeeper warning)"
codesign --deep --force --sign - "$APP"
codesign -dv "$APP" 2>&1 | head -3

if [ "$RUN_SELFTEST" = "1" ]; then
  echo "==> Self-test: booting the packaged server headlessly"
  SELFTEST_PORT="4321"
  ( cd "$PAYLOAD" && PORT="$SELFTEST_PORT" HOSTNAME="127.0.0.1" node server.js > /tmp/package-selftest.log 2>&1 & echo $! > /tmp/package-selftest.pid )
  ok="0"
  for i in $(seq 1 40); do
    code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$SELFTEST_PORT/" || true)"
    if [ "$code" = "200" ]; then ok="1"; break; fi
    sleep 0.25
  done
  kill "$(cat /tmp/package-selftest.pid)" 2>/dev/null || true
  rm -f /tmp/package-selftest.pid
  if [ "$ok" = "1" ]; then
    echo "==> Self-test PASSED (packaged server served / with HTTP 200)"
  else
    echo "==> Self-test FAILED — see /tmp/package-selftest.log" >&2
    exit 1
  fi
fi

echo "==> Building the .dmg"
DMG="$DIST/$APP_NAME.dmg"
DMG_STAGING="$(mktemp -d)"
trap 'rm -rf "$DMG_STAGING"' EXIT
cp -R "$APP" "$DMG_STAGING/"
ln -s /Applications "$DMG_STAGING/Applications"
rm -f "$DMG"
hdiutil create -volname "$APP_NAME" -srcfolder "$DMG_STAGING" -ov -format UDZO "$DMG" >/dev/null
echo "==> Built: $DMG"

echo ""
echo "Done. To try it: open \"$APP\"  (or double-click it in Finder),"
echo "or mount \"$DMG\" and drag $APP_NAME to Applications."
echo "Unsigned build — first launch will be blocked by Gatekeeper. Go to"
echo "System Settings -> Privacy & Security -> \"Open Anyway\" next to the"
echo "$APP_NAME warning, then try opening it again."
