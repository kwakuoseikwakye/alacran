#!/bin/bash
# Vendor a curated subset of coreyhaines31/marketingskills (MIT) into the
# marketing starter pack, pinned to one upstream tag.
#
# This is the whole update mechanism: bump TAG, rerun, review the diff like any
# other commit. No submodule, and nothing fetches at runtime or at install time
# — a company scaffolded from this pack gets whatever was committed here.
#
# Rerunning wipes and rewrites the vendored tree, so a skill renamed or dropped
# upstream disappears here too. Never hand-edit the result; edit this script.
#
# Curated, not all 49 upstream skills: a starter pack is a small overlay on the
# base company skeleton (see lib/company-starter-packs.ts), and these are the
# ones a general small company actually repeats. Widen it by adding an id to
# SKILLS. `product-marketing` is load-bearing — it writes the
# .agents/product-marketing.md context file every other skill reads.
set -euo pipefail

TAG=v2.10.0
SKILLS=(product-marketing marketing-plan copywriting content-strategy seo-audit analytics emails social launch cro)

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
dest="$repo_root/templates/packs/marketing/.claude/skills"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

curl -fsSL "https://github.com/coreyhaines31/marketingskills/archive/refs/tags/$TAG.tar.gz" \
  | tar -xzf - -C "$tmp" --strip-components=1 \
      "marketingskills-${TAG#v}/LICENSE" \
      $(printf "marketingskills-${TAG#v}/skills/%s " "${SKILLS[@]}")

# evals/ is upstream's own test fixtures — dead weight in a company's repo.
find "$tmp/skills" -type d -name evals -exec rm -rf {} +

rm -rf "$dest"
mkdir -p "$dest"
cp -R "$tmp/skills/." "$dest/"

{
  printf '# Vendored marketing skills\n\n'
  printf 'Source: https://github.com/coreyhaines31/marketingskills\n'
  printf 'Tag: %s\n' "$TAG"
  printf 'Vendored by: scripts/sync-marketing-skills.sh (do not hand-edit these files)\n\n'
  printf 'Upstream MIT license follows.\n\n---\n\n'
  cat "$tmp/LICENSE"
} > "$dest/UPSTREAM.md"

for s in "${SKILLS[@]}"; do
  [ -f "$dest/$s/SKILL.md" ] || { echo "sync failed: no $s/SKILL.md at $TAG — renamed or dropped upstream?" >&2; exit 1; }
done

echo "Vendored ${#SKILLS[@]} skills at $TAG into templates/packs/marketing/.claude/skills"
