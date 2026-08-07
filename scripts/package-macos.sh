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
# separate, not-yet-done step.
#
# Usage:  bash scripts/package-macos.sh [--no-selftest]
#
# The app name and default port are the two knobs; change APP_NAME if the
# product name ever changes.

set -euo pipefail

APP_NAME="Alacrán"             # scorpion — final product name (keep in sync with lib/branding.ts)
DEFAULT_PORT="4319"             # uncommon default to avoid collisions

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# Single source of truth for the version: package.json. It used to be typed
# by hand into CFBundleVersion and CFBundleShortVersionString, which meant a
# shipped build could claim 0.1.0 forever while package.json moved on — and
# a bundle that lies about its version makes "is the user up to date?"
# unanswerable for support.
APP_VERSION="$(node -p "require('./package.json').version")"
echo "==> Packaging version $APP_VERSION"

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

# A double-clicked .app doesn't source ~/.zshrc or ~/.bash_profile, so
# anything installed via nvm/pyenv/a custom prefix (claude, gog...) is
# invisible even though it resolves fine from a real Terminal. Ask the
# user's own shell for its real PATH instead of guessing directories.
#
# Needs -i (interactive) as well as -l (login): some shell rc files —
# Ubuntu's stock ~/.bashrc, notably, though this is the macOS launcher —
# guard their body with something like \`case \$- in *i*) ;; *) return;;
# esac\` that skips everything past it for a non-interactive shell, which
# is exactly what -l alone produces. nvm/pyenv-style installers append
# their PATH setup past exactly that kind of guard, so without -i this
# looks like it works but silently misses them. Falls back to a few known
# install locations if the shell invocation fails for any reason.
# \`printenv PATH\`, not \`echo "\$PATH"\`: in fish, PATH is a list and echo
# joins it with SPACES, producing one unusable mega-element. printenv reads
# the actual environment variable, which is colon-separated by definition in
# every shell. </dev/null so an rc file that reads stdin hits EOF instead of
# hanging here forever — this runs before the server starts, so a hang means
# the app never launches at all.
LOGIN_PATH="\$("\${SHELL:-/bin/zsh}" -ilc 'printenv PATH' </dev/null 2>/dev/null | tail -n 1 || true)"
# Union, never either/or. The shell's own PATH covers nvm/pyenv (whose bin
# directories are version-specific and can't be guessed), and the fixed list
# covers the case where rc parsing came back incomplete for any reason — a
# non-bash/zsh shell, an rc file that sets PATH only under a conditional, a
# guard we haven't seen. Making the fixed list an \`else\` branch was a real
# regression: \$HOME/.npm-global/bin (a plain \`npm config set prefix\` setup,
# and a real user's actual claude location) used to be prepended
# unconditionally, and became reachable only when the shell call FAILED.
#
# The empty-LOGIN_PATH branch is not cosmetic: an empty element anywhere in
# PATH is interpreted as the CURRENT DIRECTORY by POSIX, and this script
# cd's into the app payload — so a bare "\$LOGIN_PATH:..." with no shell
# PATH would make every unqualified command prefer a same-named file
# sitting in that directory. Verified directly rather than assumed.
# Every user-level location a CLI this app drives (claude, gog, gh, ollama)
# realistically installs to. \$HOME/.local/bin is Claude Code's own native
# installer target and pipx's; .npm-global/bin is \`npm config set prefix\`;
# the rest are one per package manager that installs to a FIXED directory.
# nvm/fnm/pyenv/asdf are deliberately absent — their directories are
# version-specific and unguessable, which is exactly what reading the
# shell's own PATH above is for.
COMMON_BINS="\$HOME/.local/bin:\$HOME/.npm-global/bin:\$HOME/bin:\$HOME/.bun/bin:\$HOME/.deno/bin:\$HOME/.yarn/bin:\$HOME/.volta/bin:/opt/homebrew/bin:/usr/local/bin"
if [ -n "\$LOGIN_PATH" ]; then
  export PATH="\$LOGIN_PATH:\$COMMON_BINS:\$PATH"
else
  export PATH="\$COMMON_BINS:\$PATH"
fi

NODE_BIN="\$(command -v node || true)"
if [ -z "\$NODE_BIN" ]; then
  osascript -e 'display alert "Node.js is required" message "Please install Node.js (nodejs.org) and then reopen this app."'
  exit 1
fi

PORT="\${PORT:-$DEFAULT_PORT}"
export PORT
export HOSTNAME="127.0.0.1"

# Pinned explicitly (not just inherited from the standalone server) because
# lib/data-dir.ts keys off it to store the company registry in
# ~/Library/Application Support instead of inside this bundle — which every
# app update replaces wholesale.
export NODE_ENV="production"

# A prior run that wasn't cleanly quit (Force Quit, the .app deleted or
# replaced while it was still running, a crashed launcher) can leave an
# orphaned server holding this port forever — every later launch, even a
# freshly reinstalled or updated one, would silently keep talking to that
# stale build, since the readiness check below can't tell "just started
# this instant" from "orphaned from last time". This port is deliberately
# uncommon (see DEFAULT_PORT above) specifically so nothing but a previous
# Alacrán instance should ever legitimately be on it — safe to assume and
# clear before starting a fresh one.
if command -v lsof >/dev/null 2>&1; then
  OLD_PID="\$(lsof -ti "tcp:\$PORT" 2>/dev/null || true)"
  if [ -n "\$OLD_PID" ]; then
    kill \$OLD_PID 2>/dev/null || true
    sleep 0.5
  fi
fi

cd "\$APP_DIR"
"\$NODE_BIN" server.js &
SERVER_PID=\$!
# The other half of the fix above: make sure THIS run doesn't become next
# time's orphan. Quitting the app (Cmd+Q, Force Quit, or closing the
# terminal it was run from) now actually stops the server instead of
# leaving it running headless in the background indefinitely.
trap 'kill \$SERVER_PID 2>/dev/null' EXIT INT TERM

# Wait for the server to answer, then open the browser.
for i in \$(seq 1 40); do
  if curl -s -o /dev/null "http://127.0.0.1:\$PORT/"; then break; fi
  sleep 0.25
done
open "http://127.0.0.1:\$PORT/"

wait \$SERVER_PID
LAUNCH
chmod +x "$LAUNCHER"

echo "==> Generating the app icon (.icns)"
# scripts/generate-logo.py already produces components/alacran-icon-master.png:
# a 1024x1024, square, transparent, NOT-upscaled-again master (it used to be
# built here instead, from components/alacran-logo.png's 600x626 — a real
# blurry-icon bug, since every tier up to the 512@2x one had to upscale that
# 600px source by 1.7x). All ten iconset sizes are downsamples from the
# 1024px master now, so none of them upscale anything.
if [ ! -f "components/alacran-icon-master.png" ]; then
  echo "ERROR: components/alacran-icon-master.png is missing — run 'python3 scripts/generate-logo.py' first." >&2
  exit 1
fi
ICONSET_DIR="$(mktemp -d)/AppIcon.iconset"
mkdir -p "$ICONSET_DIR"
for spec in "16 icon_16x16.png" "32 icon_16x16@2x.png" "32 icon_32x32.png" "64 icon_32x32@2x.png" \
            "128 icon_128x128.png" "256 icon_128x128@2x.png" "256 icon_256x256.png" \
            "512 icon_256x256@2x.png" "512 icon_512x512.png" "1024 icon_512x512@2x.png"; do
  set -- $spec
  sips -z "$1" "$1" "components/alacran-icon-master.png" --out "$ICONSET_DIR/$2" >/dev/null
done
mkdir -p "$APP/Contents/Resources"
iconutil -c icns "$ICONSET_DIR" -o "$APP/Contents/Resources/AppIcon.icns"
rm -rf "$(dirname "$ICONSET_DIR")"

echo "==> Writing Info.plist"
cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>$APP_NAME</string>
  <key>CFBundleDisplayName</key><string>$APP_NAME</string>
  <key>CFBundleIdentifier</key><string>app.alacran.desktop</string>
  <key>CFBundleVersion</key><string>$APP_VERSION</string>
  <key>CFBundleShortVersionString</key><string>$APP_VERSION</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>launcher</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
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
echo "Not notarized. A COPY THAT HAS BEEN DOWNLOADED carries macOS's quarantine"
echo "flag and will refuse to open — often claiming the app is \"damaged\", which"
echo "it is not. The installer instruction users need is:"
echo ""
echo "    xattr -cr \"/Applications/$APP_NAME.app\""
echo ""
echo "Right-click -> Open is NOT sufficient for an ad-hoc-signed bundle on"
echo "current macOS. This build, sitting in dist/, has no quarantine flag and"
echo "opens directly — do not mistake that for the download working."
