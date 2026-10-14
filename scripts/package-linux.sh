#!/bin/bash
# Package the control-panel as a Debian (.deb) NATIVE app.
#
# A self-contained Next.js standalone server that, on launch, starts the
# production server locally and displays it in a real GTK window
# (scripts/webview-linux.py, a WebKitGTK view). No browser is involved: no
# tab, no address bar, no dependency on which browser the user has set as
# default. Requires the end user to have Node.js on their PATH (CLI-
# comfortable early adopters who already have it, since Claude Code CLI
# needs Node too).
#
# mac packaging used to live alongside this as scripts/package-macos.sh; it
# now lives in the separately maintained macOS desktop shell (an Electron shell —
# mac is the deliberate exception to Linux's Electron-free shape). What still carries over
# to it unchanged is the payload assembly logic below: `.next/standalone` +
# `.next/static` + `templates/`, since `output: "standalone"` in
# next.config.ts is already platform-agnostic. Keep the two in sync if this
# payload-assembly logic changes — the macOS shell's
# scripts/build-app-payload.sh ports it verbatim rather than importing it.
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
APP_DISPLAY_NAME="Alacrán"   # keep in sync with lib/branding.ts and the macOS shell's electron-builder.json
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
# Static assets and the bundled company template.
#
# `cp -R templates "$PAYLOAD/templates"` was WRONG and shipped broken builds in
# v0.19.0-v0.22.0: since v77 added a literal path.join(process.cwd(),
# "templates", "packs") to app/page.tsx, Next's file tracing copies
# templates/packs into .next/standalone, so $PAYLOAD/templates already exists by
# the time this runs and `cp -R src dst` nests instead of replacing — putting the
# real tree at templates/templates/ and hiding templates/company-starter from the
# path the app actually reads. Copy the CONTENTS so it merges either way.
mkdir -p "$PAYLOAD/.next" "$PAYLOAD/templates"
cp -R .next/static "$PAYLOAD/.next/static"
cp -R templates/. "$PAYLOAD/templates/"

# The blanket copy above takes the templates directory as it sits on the
# BUILD machine, git-ignored dev droppings included — the same class of leak
# the `rm -rf "$PAYLOAD/.data"` guard below exists for. Measured, not
# theoretical: every shipped package so far carried
# templates/company-starter/.pytest_cache, a stale pytest run from someone's
# laptop, into every scaffolded company.
#
# ponytail: a fixed name list, not a general "drop anything git-ignored"
# rule. These are the ones that have actually shown up; if a third kind
# appears, prefer switching this to `git ls-files templates`
# over lengthening the list.
find "$PAYLOAD/templates" \( -name .pytest_cache -o -name __pycache__ -o -name .DS_Store \) -prune -exec rm -rf {} +

# node-pty, copied by hand for the reason next.config.ts explains: its binary
# path is built at runtime from platform+arch+ABI, so Next's tracer never sees
# it and `output: standalone` leaves it out.
#
# `build/` is deliberately EXCLUDED here — and deliberately INCLUDED by
# the macOS shell's scripts/build-app-payload.sh, which is not an
# inconsistency:
#
#   * The tarball ships prebuilds for LINUX ONLY (x64/arm64/arm/ia32), selected
#     at runtime by platform+arch+Node ABI. That is what the .deb needs, and
#     what keeps it Architecture: all.
#   * There is no prebuilds/darwin-*, so macOS resolves null and falls back to
#     build/Release — which is why the mac payload must carry it.
#
# Shipping build/ in the .deb would put ONE binary, built for the container's
# arch and Node ABI, ahead of the correct per-ABI prebuild for every user.
PTY_PKG="node_modules/@homebridge/node-pty-prebuilt-multiarch"
if [ -d "$PTY_PKG" ]; then
  mkdir -p "$PAYLOAD/$PTY_PKG"
  ( cd "$PTY_PKG" && tar --exclude=./build -cf - . ) | ( cd "$PAYLOAD/$PTY_PKG" && tar -xf - )
  if [ ! -d "$PAYLOAD/$PTY_PKG/prebuilds" ]; then
    echo "FATAL: node-pty prebuilds missing from the payload — the in-app terminal would 500" >&2
    exit 1
  fi
else
  echo "FATAL: $PTY_PKG not installed; run npm install before packaging" >&2
  exit 1
fi

# The check that would have caught the above. company-starter is what every
# scaffold copies from, and its absence is silent (see
# createCompanyFromTemplateImpl), so assert it is where the app looks.
[ -d "$PAYLOAD/templates/company-starter" ] || { echo "FATAL: templates/company-starter missing from the payload" >&2; exit 1; }
if [ -d "$PAYLOAD/templates/templates" ]; then
  echo "FATAL: templates/ nested inside itself in the payload" >&2
  exit 1
fi

# `next build` never cleans .next/standalone before writing to it, so a stray
# .data left over from running `node server.js` directly against this
# directory (a real local dev/verification workflow) would survive every
# later build and get bundled by the blanket copy above. GitHub Actions'
# ubuntu-latest runner starts from a clean checkout every time, so this is
# unreachable there — but this script is also runnable locally (see the
# header), and this exact bug shipped once on the macOS side (v0.7.8 carried
# a real dev-machine company registry into every fresh install). Never bundle
# local runtime state, regardless of what .next/standalone happens to hold.
rm -rf "$PAYLOAD/.data"

# components/alacran-icon-512.png (scripts/generate-logo.py) is a real
# square 512x512 render, not app/icon.png's 512x534 favicon source —
# a hicolor theme bucket's file is expected to actually be the size its
# directory name claims. Shipping the wrong one here (previously app/icon.png
# at 128x133, stretched 4x by whatever desktop environment read it) is the
# actual reason this icon looked blurry on Linux.
if [ -f "components/alacran-icon-512.png" ]; then
  cp "components/alacran-icon-512.png" "$BUILDROOT/usr/share/icons/hicolor/512x512/apps/$PKG_NAME.png"
fi

# The native window. A Python + GObject-introspection script rather than a
# compiled shell on purpose: nothing to build in CI, and nothing
# architecture-specific to ship, which is what keeps Architecture: all below
# true. WebKitGTK itself comes from the distro, as a dependency.
echo "==> Installing the native window (WebKitGTK)"
cp scripts/webview-linux.py "$BUILDROOT/usr/lib/$PKG_NAME/alacran-window.py"
chmod +x "$BUILDROOT/usr/lib/$PKG_NAME/alacran-window.py"

echo "==> Writing the launcher"
LAUNCHER="$BUILDROOT/usr/bin/$PKG_NAME"
cat > "$LAUNCHER" <<LAUNCH
#!/bin/bash
# Desktop-launcher / terminal entry point: start the local server, show the window.
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
# \`printenv PATH\`, not \`echo "\$PATH"\`: in fish, PATH is a list and echo
# joins it with SPACES, producing one unusable mega-element. printenv reads
# the actual environment variable, which is colon-separated by definition in
# every shell. </dev/null so an rc file that reads stdin hits EOF instead of
# hanging here forever — this runs before the server starts, so a hang means
# the app never launches at all.
LOGIN_PATH="\$("\${SHELL:-/bin/bash}" -ilc 'printenv PATH' </dev/null 2>/dev/null | tail -n 1 || true)"
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
# Every user-level location a CLI this app drives (claude, gog, gh, ollama)
# realistically installs to. \$HOME/.local/bin is Claude Code's own native
# installer target and pipx's; .npm-global/bin is \`npm config set prefix\`;
# the rest are one per package manager that installs to a FIXED directory.
# nvm/fnm/pyenv/asdf are deliberately absent — their directories are
# version-specific and unguessable, which is exactly what reading the
# shell's own PATH above is for.
COMMON_BINS="\$HOME/.local/bin:\$HOME/.npm-global/bin:\$HOME/bin:\$HOME/.bun/bin:\$HOME/.deno/bin:\$HOME/.yarn/bin:\$HOME/.volta/bin:/usr/local/bin:/snap/bin"
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
# -sTCP:LISTEN is not optional: a bare \`lsof -ti tcp:PORT\` matches any
  # process holding ANY socket on that port, including a CLIENT connection to
  # it — so this used to match (and \`kill -9\`) the user's browser network
  # process, which had a live connection to this very port because the app
  # opened it there. Only a process actually LISTENING is a stale server.
  OLD_PID="\$(lsof -ti "tcp:\$PORT" -sTCP:LISTEN 2>/dev/null || true)"
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

# Wait for the server to answer, then show the native window.
for i in \$(seq 1 40); do
  if curl -s -o /dev/null "http://127.0.0.1:\$PORT/"; then break; fi
  sleep 0.25
done

WINDOW="/usr/lib/$PKG_NAME/alacran-window.py"
if [ -f "\$WINDOW" ] && python3 -c "import gi" >/dev/null 2>&1; then
  # The window is what this script now waits on, so the app's lifetime is the
  # window's lifetime: close it and the trap above stops the server, instead
  # of leaving a headless server running with nothing on screen.
  python3 "\$WINDOW" "http://127.0.0.1:\$PORT/" &
  WINDOW_PID=\$!
  # The reverse direction, which the browser build never needed: if the
  # SERVER dies first (an in-app update restarts it, or it crashes), take the
  # window down with it rather than leaving a dead page on screen.
  ( while kill -0 \$SERVER_PID 2>/dev/null; do sleep 1; done
    kill \$WINDOW_PID 2>/dev/null ) &
  wait \$WINDOW_PID
else
  # Only reachable if the GI/WebKit dependencies were force-removed after
  # install (dpkg won't install without them). Falling back to the browser is
  # not the product any more, but it beats a menu entry that does nothing.
  echo "Alacrán's window components are missing — falling back to your browser." >&2
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open "http://127.0.0.1:\$PORT/" >/dev/null 2>&1 &
  else
    echo "Open http://127.0.0.1:\$PORT/ in your browser."
  fi
  wait \$SERVER_PID
fi
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
# The native window is deliberately a Python script for the same reason: a
# compiled GTK shell would make this package per-architecture.
cat > "$BUILDROOT/DEBIAN/control" <<CONTROL
Package: $PKG_NAME
Version: $APP_VERSION
Section: devel
Priority: optional
Architecture: all
Depends: nodejs (>= 18), python3, python3-gi, gir1.2-gtk-3.0, gir1.2-webkit2-4.1 | gir1.2-webkit2-4.0
Maintainer: Alacrán <contact@alacran.app>
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
