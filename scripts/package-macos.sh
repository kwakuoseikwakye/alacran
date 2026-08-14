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

# The bundled Node runtime. Before this, the launcher alerted "Node.js is
# required" and quit if `command -v node` found nothing — gate zero for a
# non-technical user, who has no reason to have Node and no idea what it is.
# The standalone server needs nothing from Node but the binary itself.
#
# Pinned rather than copied from this build machine: `cp $(command -v node)`
# would ship whatever happens to be installed here, including a version-
# specific nvm build, and would silently change what users run whenever this
# machine's node changes.
NODE_VERSION="v24.19.0"
case "$(uname -m)" in
  arm64) NODE_ARCH="darwin-arm64" ;;
  x86_64) NODE_ARCH="darwin-x64" ;;
  *) echo "ERROR: unsupported arch $(uname -m) for the bundled Node" >&2; exit 1 ;;
esac
NODE_TARBALL="node-$NODE_VERSION-$NODE_ARCH.tar.gz"
NODE_CACHE="$DIST/.node-cache"
mkdir -p "$NODE_CACHE"

if [ ! -f "$NODE_CACHE/$NODE_TARBALL" ]; then
  echo "==> Downloading Node $NODE_VERSION ($NODE_ARCH)"
  # Download to a temp name and move only on success. A curl that times out
  # mid-transfer otherwise leaves a truncated file that the `-f` check above
  # happily accepts on the next run — which is exactly what happened while
  # writing this, and only the checksum below caught it.
  curl -fsSL -o "$NODE_CACHE/$NODE_TARBALL.part" \
    "https://nodejs.org/dist/$NODE_VERSION/$NODE_TARBALL"
  mv "$NODE_CACHE/$NODE_TARBALL.part" "$NODE_CACHE/$NODE_TARBALL"
fi

# Verify against nodejs.org's own published checksums. This binary is
# executed by every user of the shipped app, so a corrupted or swapped
# download is not something to find out about later.
echo "==> Verifying the Node download"
curl -fsSL -o "$NODE_CACHE/SHASUMS256.txt" \
  "https://nodejs.org/dist/$NODE_VERSION/SHASUMS256.txt"
( cd "$NODE_CACHE" && grep " $NODE_TARBALL\$" SHASUMS256.txt | shasum -a 256 -c - ) \
  || { echo "ERROR: Node download failed checksum verification" >&2; exit 1; }

echo "==> Assembling the app payload"
rm -rf "$APP"
mkdir -p "$PAYLOAD" "$APP/Contents/MacOS"

# Standalone server + its traced node_modules + package.json
cp -R .next/standalone/. "$PAYLOAD/"
# Static assets and the bundled company template (standalone doesn't include these)
mkdir -p "$PAYLOAD/.next"
cp -R .next/static "$PAYLOAD/.next/static"
cp -R templates "$PAYLOAD/templates"

# Just the binary — not the headers, npm, or docs in the tarball. ~110MB of
# the ~50MB-compressed download is things a standalone Next server never uses.
echo "==> Bundling the Node runtime"
tar -xzf "$NODE_CACHE/$NODE_TARBALL" -C "$NODE_CACHE" \
  "node-$NODE_VERSION-$NODE_ARCH/bin/node"
cp "$NODE_CACHE/node-$NODE_VERSION-$NODE_ARCH/bin/node" "$APP/Contents/Resources/node"
chmod +x "$APP/Contents/Resources/node"

# `next build` never cleans .next/standalone before writing to it — it only
# adds/overwrites what it generates — so a stray .data left over from running
# `node server.js` directly against this same directory (a real dev
# workflow: cd .next/standalone && node server.js, for a quick production-mode
# check) survives every later `npm run build` and gets swept into the payload
# by the blanket copy above. That actually shipped once: v0.7.8's published
# .dmg carried a real company entry from this machine's own dev registry,
# which lib/data-dir.ts's migrateLegacyData() then silently copied into every
# fresh install's real data dir on first launch. This app must never bundle
# ANY local runtime state — belt-and-suspenders regardless of what
# .next/standalone happens to contain when this script runs.
rm -rf "$PAYLOAD/.data"

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

# The bundled runtime first, always. Falling back to the user's own node
# only covers a bundle whose Resources/node went missing; it is not a
# preference. A user's node can be any version, including one too old for
# the standalone server, and "works on the machine that built it" is exactly
# the failure this bundling exists to remove.
BUNDLED_NODE="\$(cd "\$(dirname "\$0")/../Resources" && pwd)/node"
if [ -x "\$BUNDLED_NODE" ]; then
  NODE_BIN="\$BUNDLED_NODE"
else
  NODE_BIN="\$(command -v node || true)"
fi
if [ -z "\$NODE_BIN" ]; then
  osascript -e 'display alert "Alacrán could not start" message "This copy is missing its bundled runtime. Please download Alacrán again."'
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
    # A plain kill + fixed sleep isn't enough: a prior instance with a live
    # browser tab still connected takes longer than 0.5s to actually release
    # the port, this run's own \`node server.js &\` then silently loses the
    # EADDRINUSE race in the background, and the health-check below happily
    # talks to the OLD server instead — the exact "installed the update but
    # it still shows the old app" failure. Confirm the port is actually
    # free, escalating to -9, instead of trusting one signal + a guess.
    for i in \$(seq 1 4); do
      STILL_UP="\$(lsof -ti "tcp:\$PORT" 2>/dev/null || true)"
      [ -z "\$STILL_UP" ] && break
      kill -9 \$STILL_UP 2>/dev/null || true
      sleep 0.25
    done
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
  # PID-scoped, not a fixed /tmp path: two runs of this script close enough
  # together (a broken build fixed and immediately re-run, same as happened
  # live while building this) must never share bookkeeping files.
  SELFTEST_PID_FILE="/tmp/package-selftest.$$.pid"
  SELFTEST_LOG_FILE="/tmp/package-selftest.$$.log"

  # Belt-and-suspenders against exactly the failure this once shipped with:
  # if anything from a previous run is still bound to this port, curl's
  # health check below can pass against THAT stale process while this run's
  # own node never even manages to bind (EADDRINUSE) — so the kill by this
  # run's own captured PID silently no-ops against an already-dead process,
  # and the real, still-running culprit is never touched. Confirmed live:
  # this leaked an orphaned next-server twice in one session. Same
  # lsof-based clear the launcher itself already does for the real app
  # port, just never applied here too.
  if command -v lsof >/dev/null 2>&1; then
    STALE_PID="$(lsof -ti "tcp:$SELFTEST_PORT" 2>/dev/null || true)"
    if [ -n "$STALE_PID" ]; then
      echo "==> Clearing a stale process already on port $SELFTEST_PORT (pid $STALE_PID)"
      kill $STALE_PID 2>/dev/null || true
      sleep 0.5
    fi
  fi

  ( cd "$PAYLOAD" && PORT="$SELFTEST_PORT" HOSTNAME="127.0.0.1" node server.js > "$SELFTEST_LOG_FILE" 2>&1 & echo $! > "$SELFTEST_PID_FILE" )
  SELFTEST_PID="$(cat "$SELFTEST_PID_FILE")"
  ok="0"
  for i in $(seq 1 40); do
    code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$SELFTEST_PORT/" || true)"
    if [ "$code" = "200" ]; then ok="1"; break; fi
    sleep 0.25
  done

  # Kill by the PID captured above AND, belt-and-suspenders, whatever is
  # actually on the port right now — they should be the same process, but
  # this is exactly the assumption that broke before. Then actively confirm
  # the port is free rather than trusting a fire-and-forget kill; escalate
  # to -9 if a plain kill hasn't taken effect within a second.
  kill "$SELFTEST_PID" 2>/dev/null || true
  for i in $(seq 1 4); do
    STILL_UP="$(lsof -ti "tcp:$SELFTEST_PORT" 2>/dev/null || true)"
    [ -z "$STILL_UP" ] && break
    kill -9 $STILL_UP 2>/dev/null || true
    sleep 0.25
  done
  rm -f "$SELFTEST_PID_FILE"

  if [ "$ok" = "1" ]; then
    echo "==> Self-test PASSED (packaged server served / with HTTP 200)"
    rm -f "$SELFTEST_LOG_FILE"
  else
    echo "==> Self-test FAILED — see $SELFTEST_LOG_FILE" >&2
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

# The .zip is what the IN-APP updater downloads (lib/updates/perform-mac-update-impl.ts);
# the .dmg stays because it's the human install gesture. `ditto -c -k` is
# Apple's own way to archive a bundle: verified on this app to round-trip with
# `codesign --verify --deep` still passing and the launcher's executable bit
# intact, which a plain `zip -r` does not guarantee. Both must be uploaded to
# the release — an updater pointed at a release with no Alacran.zip 404s.
echo "==> Building the .zip (in-app update payload)"
ZIP="$DIST/Alacran.zip"
rm -f "$ZIP"
ditto -c -k --sequesterRsrc --keepParent "$APP" "$ZIP"
echo "==> Built: $ZIP"

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
