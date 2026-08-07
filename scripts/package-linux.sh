#!/bin/bash
# Package the control-panel as a Debian (.deb) browser-runner app.
#
# Same shape as scripts/package-macos.sh: a self-contained Next.js standalone
# server that, on launch, starts the production server locally and opens the
# user's default browser to it. Requires the end user to have Node.js on
# their PATH (same v1 audience as macOS: CLI-comfortable early adopters who
# already have it, since Claude Code CLI needs Node too).
#
# This is NOT a port of package-macos.sh's launcher/Info.plist mechanics —
# .deb is a different packaging format end to end. What carries over
# unchanged is the payload itself: `.next/standalone` + `.next/static` +
# `templates/`, since `output: "standalone"` in next.config.ts is already
# platform-agnostic.
#
# Produces dist/alacran_<version>_all.deb — install with
# `sudo apt install ./dist/alacran_<version>_all.deb`, or `sudo dpkg -i` +
# `sudo apt -f install` to pull in the nodejs dependency.
#
# Requires `dpkg-deb` (part of `dpkg` on any Debian/Ubuntu system) to actually
# build the .deb — this script cannot be run to completion on macOS. It has
# been exercised here only up to payload assembly; the final dpkg-deb build
# and a real `apt install` have not been verified on a real Debian machine
# yet.
#
# Usage:  bash scripts/package-linux.sh [--no-selftest]

set -euo pipefail

PKG_NAME="alacran"           # Debian package names must be lowercase, no diacritics
APP_DISPLAY_NAME="Alacrán"   # keep in sync with lib/branding.ts and package-macos.sh
DEFAULT_PORT="4319"          # same uncommon default as macOS, avoids collisions

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

if ! command -v dpkg-deb >/dev/null 2>&1; then
  echo "ERROR: dpkg-deb not found. This script builds a .deb and only runs on a Debian/Ubuntu-family system (or one with dpkg installed)." >&2
  exit 1
fi

APP_VERSION="$(node -p "require('./package.json').version")"
echo "==> Packaging version $APP_VERSION"

DIST="$REPO_ROOT/dist"
BUILDROOT="$DIST/${PKG_NAME}-deb"
PAYLOAD="$BUILDROOT/usr/lib/$PKG_NAME/app"

RUN_SELFTEST="1"
[ "${1:-}" = "--no-selftest" ] && RUN_SELFTEST="0"

echo "==> Building the production standalone server"
npm run build

if [ ! -f ".next/standalone/server.js" ]; then
  echo "ERROR: .next/standalone/server.js not found — is output:'standalone' set in next.config.ts?" >&2
  exit 1
fi

echo "==> Assembling the package payload"
rm -rf "$BUILDROOT"
mkdir -p "$PAYLOAD" "$BUILDROOT/DEBIAN" "$BUILDROOT/usr/bin" \
  "$BUILDROOT/usr/share/applications" "$BUILDROOT/usr/share/icons/hicolor/512x512/apps"

# Standalone server + its traced node_modules + package.json
cp -R .next/standalone/. "$PAYLOAD/"
# Static assets and the bundled company template (standalone doesn't include these)
mkdir -p "$PAYLOAD/.next"
cp -R .next/static "$PAYLOAD/.next/static"
cp -R templates "$PAYLOAD/templates"

# components/alacran-icon-512.png (scripts/generate-logo.py) is a real
# square 512x512 render, not app/icon.png's 512x534 favicon source —
# a hicolor theme bucket's file is expected to actually be the size its
# directory name claims. Shipping the wrong one here (previously app/icon.png
# at 128x133, stretched 4x by whatever desktop environment read it) is the
# actual reason this icon looked blurry on Linux.
if [ -f "components/alacran-icon-512.png" ]; then
  cp "components/alacran-icon-512.png" "$BUILDROOT/usr/share/icons/hicolor/512x512/apps/$PKG_NAME.png"
fi

echo "==> Writing the launcher"
LAUNCHER="$BUILDROOT/usr/bin/$PKG_NAME"
cat > "$LAUNCHER" <<LAUNCH
#!/bin/bash
# Desktop-launcher / terminal entry point: start the local server, open the browser.
APP_DIR="/usr/lib/$PKG_NAME/app"

# A .desktop launch (Terminal=false) doesn't source ~/.bashrc or ~/.profile,
# so tools installed via nvm/pipx/a custom npm prefix (claude, ollama, gh...)
# are invisible even though \`which claude\` finds them from a real terminal.
# Ask the user's own login shell for its PATH instead of guessing directories.
#
# Needs -i (interactive), not just -l (login): Ubuntu's stock ~/.bashrc
# starts with \`case \$- in *i*) ;; *) return;; esac\` — an early return for
# any NON-interactive shell — and nvm's installer appends its PATH setup
# near the bottom of .bashrc, past that guard. \`-lc\` alone hits the guard
# and skips it silently, so this looked fixed but wasn't for anyone using
# nvm specifically (confirmed by reproducing the exact guard in isolation:
# \`-lc\` returned the PATH unchanged, \`-ilc\` included nvm's bin directory).
# \`tail -n 1\` guards against a noisy interactive .bashrc (a MOTD, a
# fortune/cowsay line, etc.) printing to stdout before the real PATH line.
LOGIN_PATH="\$("\${SHELL:-/bin/bash}" -ilc 'echo -n "\$PATH"' 2>/dev/null | tail -n 1 || true)"
# Union the shell's PATH with the common user-level install locations, rather
# than trusting either alone. The shell's own PATH is the only way to find
# nvm/pyenv installs (version-specific directories, unguessable), but it can
# still come back incomplete — a non-bash shell, an rc file that sets PATH
# under a conditional, a guard variant we haven't seen — and when it does,
# these fixed locations are where a user-level npm/pipx install actually
# lands. \$HOME/.npm-global/bin in particular is a plain
# \`npm config set prefix\` setup and a real user's actual claude location;
# this launcher previously had no fixed list at all, so nothing caught it
# when the shell capture came up short.
#
# The empty-LOGIN_PATH branch is not cosmetic: an empty element anywhere in
# PATH is interpreted as the CURRENT DIRECTORY by POSIX, and this script
# cd's into the app payload — so a bare "\$LOGIN_PATH:..." with no shell
# PATH would make every unqualified command prefer a same-named file
# sitting in that directory. Verified directly rather than assumed.
COMMON_BINS="\$HOME/.npm-global/bin:\$HOME/.local/bin:\$HOME/bin:/usr/local/bin"
if [ -n "\$LOGIN_PATH" ]; then
  export PATH="\$LOGIN_PATH:\$COMMON_BINS:\$PATH"
else
  export PATH="\$COMMON_BINS:\$PATH"
fi

NODE_BIN="\$(command -v node || true)"
if [ -z "\$NODE_BIN" ]; then
  echo "Node.js is required. Please install Node.js (nodejs.org or your distro's package) and try again." >&2
  if command -v zenity >/dev/null 2>&1; then
    zenity --error --text="Node.js is required. Please install Node.js (nodejs.org) and reopen $APP_DISPLAY_NAME."
  fi
  exit 1
fi

PORT="\${PORT:-$DEFAULT_PORT}"
export PORT
export HOSTNAME="127.0.0.1"

# Pinned explicitly (not just inherited from the standalone server) because
# lib/data-dir.ts keys off it to store the company registry in
# the XDG data dir instead of inside this package — which every update
# replaces wholesale.
export NODE_ENV="production"

# A prior run that wasn't cleanly quit (the terminal it ran in was closed,
# a crashed launcher, an old package version's server still running after
# an upgrade) can leave an orphaned server holding this port forever —
# every later launch, even a freshly reinstalled or updated one, would
# silently keep talking to that stale build, since the readiness check
# below can't tell "just started this instant" from "orphaned from last
# time". This port is deliberately uncommon (see DEFAULT_PORT above)
# specifically so nothing but a previous Alacrán instance should ever
# legitimately be on it — safe to assume and clear before starting fresh.
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
# time's orphan. Closing the terminal it ran from, or Ctrl-C, now actually
# stops the server instead of leaving it running headless indefinitely.
trap 'kill \$SERVER_PID 2>/dev/null' EXIT INT TERM

# Wait for the server to answer, then open the browser.
for i in \$(seq 1 40); do
  if curl -s -o /dev/null "http://127.0.0.1:\$PORT/"; then break; fi
  sleep 0.25
done

if command -v xdg-open >/dev/null 2>&1; then
  xdg-open "http://127.0.0.1:\$PORT/" >/dev/null 2>&1 &
else
  echo "Open http://127.0.0.1:\$PORT/ in your browser."
fi

wait \$SERVER_PID
LAUNCH
chmod +x "$LAUNCHER"

echo "==> Writing the .desktop entry"
cat > "$BUILDROOT/usr/share/applications/$PKG_NAME.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=$APP_DISPLAY_NAME
Comment=Manage your AI companies
Exec=/usr/bin/$PKG_NAME
Icon=$PKG_NAME
Terminal=false
Categories=Development;
DESKTOP

echo "==> Writing DEBIAN/control"
# Architecture is "all" (not amd64/arm64): the standalone output is plain
# traced JS + Next.js's own prebuilt native deps for whichever arch `npm run
# build` ran on. This app avoids adding further native deps on purpose (see
# CLAUDE.md's `unoptimized` next/image note, to skip a runtime sharp
# dependency) — if that ever changes, this must become arch-specific.
cat > "$BUILDROOT/DEBIAN/control" <<CONTROL
Package: $PKG_NAME
Version: $APP_VERSION
Section: devel
Priority: optional
Architecture: all
Depends: nodejs (>= 18)
Maintainer: Alacrán <contact@alacran.ai>
Description: Manage your AI companies
 A local dashboard for managing AI "companies" — status, activity, and
 quick actions for every agent Alacrán manages on this machine.
CONTROL

echo "==> Writing DEBIAN/postrm (uninstaller)"
# dpkg already removes everything IT installed (the binary, the .desktop
# entry, the icon) on both 'remove' and 'purge' — that's the uninstaller for
# the app itself, no custom script needed for it. The one thing dpkg can't
# see is lib/data-dir.ts's per-user data directory, written at runtime under
# $HOME rather than tracked as a package file. Only touch it on 'purge'
# (Debian convention: 'remove' keeps data in case of a reinstall) and only
# for $SUDO_USER specifically — this is a single-user desktop app, and
# guessing at every home directory on the machine to wipe would be a far
# more destructive action than this script has any business taking.
cat > "$BUILDROOT/DEBIAN/postrm" <<'POSTRM'
#!/bin/bash
set -e

if [ "$1" = "purge" ]; then
  if [ -n "${SUDO_USER:-}" ] && [ "$SUDO_USER" != "root" ]; then
    USER_HOME="$(getent passwd "$SUDO_USER" | cut -d: -f6)"
    DATA_DIR="$USER_HOME/.local/share/Alacrán"
    if [ -n "$USER_HOME" ] && [ -d "$DATA_DIR" ]; then
      echo "alacran: removing $DATA_DIR"
      rm -rf "$DATA_DIR"
    fi
  else
    echo "alacran: couldn't tell which user ran this purge — remove ~/.local/share/Alacrán yourself if you want your company data gone too."
  fi
fi

exit 0
POSTRM
chmod +x "$BUILDROOT/DEBIAN/postrm"

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

echo "==> Building the .deb"
DEB="$DIST/${PKG_NAME}_${APP_VERSION}_all.deb"
rm -f "$DEB"
dpkg-deb --build --root-owner-group "$BUILDROOT" "$DEB"
echo "==> Built: $DEB"

echo ""
echo "Done. Install with:"
echo "  sudo apt install \"$DEB\"     (pulls in nodejs if missing)"
echo "or:"
echo "  sudo dpkg -i \"$DEB\" && sudo apt -f install"
echo ""
echo "Launch from the applications menu ($APP_DISPLAY_NAME), or run: $PKG_NAME"
