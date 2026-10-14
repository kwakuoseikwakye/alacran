#!/bin/bash
# Uninstalls Alacrán from this Mac.
#
# A standalone script, not a button inside the app: the running app IS the
# thing being deleted, and a live Node server deleting its own executing
# .app bundle mid-request is exactly the kind of self-modifying flow this
# project deliberately avoids for updates too (see
# lib/updates/perform-linux-update-impl.ts's comment for the same reasoning).
# There's also no package manager involved on macOS (no `brew uninstall`,
# no apt) — the .app was dragged in, so it has to be dragged/removed by hand
# or with this script.
#
# Usage: bash scripts/uninstall-macos.sh

set -euo pipefail

APP_NAME="Alacrán"
# The bundle is named WITHOUT the accent while the data directory keeps it —
# these are deliberately different and must not be re-merged into one variable.
# The Electron build's productName is unaccented because macOS stores a bundle
# filename NFD-normalized while Info.plist carries it NFC, and the mismatch
# stops Electron resolving its own executable (SIGTRAP on every launch) — see
# the macOS shell/electron-builder.json's note. The data directory is
# resolved by lib/data-dir.ts, which has always written the ACCENTED name and
# must keep doing so: that is where an existing user's companies.json lives,
# and renaming it would orphan every registered company.
BUNDLE_PATH="/Applications/Alacran.app"
APP_PATH="$BUNDLE_PATH"
[ -d "$APP_PATH" ] || APP_PATH="/Applications/$APP_NAME.app" # pre-0.34 accented bundle
DATA_DIR="$HOME/Library/Application Support/$APP_NAME"

if [ ! -d "$APP_PATH" ] && [ ! -d "$DATA_DIR" ]; then
  echo "Nothing to remove — $APP_NAME isn't installed at $APP_PATH."
  exit 0
fi

echo "This will remove:"
[ -d "$APP_PATH" ] && echo "  $APP_PATH"
if [ -d "$DATA_DIR" ]; then
  echo "  $DATA_DIR"
  echo "  (this is only Alacrán's own registry/settings — your companies' actual"
  echo "   files live wherever you put them, e.g. ~/AI-Native/, and are untouched)"
fi

read -r -p "Continue? [y/N] " confirm
if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
  echo "Cancelled."
  exit 0
fi

if [ -d "$APP_PATH" ]; then
  rm -rf "$APP_PATH"
  echo "Removed $APP_PATH"
fi

if [ -d "$DATA_DIR" ]; then
  rm -rf "$DATA_DIR"
  echo "Removed $DATA_DIR"
fi

echo "Done."
