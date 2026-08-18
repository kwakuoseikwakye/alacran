#!/bin/bash
# Vendor a curated subset of third-party Agent Skills into a starter pack,
# pinned to one upstream tag per pack.
#
#   bash scripts/sync-vendored-skills.sh              # every pack below
#   bash scripts/sync-vendored-skills.sh hr-people    # just one, by pack dir name
#
# This is the whole update mechanism: bump that pack's TAG, rerun, review the
# diff like any other commit. No submodule, and nothing fetches at runtime or at
# install time — a company scaffolded from a pack gets whatever was committed.
#
# Rerunning wipes and rewrites the vendored tree, so a skill renamed or dropped
# upstream disappears here too. Never hand-edit the result; edit this script.
#
# Adding a pack is one case block here plus one entry in lib/vendored-skills.ts —
# that is all three packs below cost. Nothing else in the app changes: the
# "Update skills" button, its staleness check and its safety rules are
# pack-agnostic, and the tests iterate the list rather than naming packs.
#
# Curated, never the whole upstream repo: a starter pack is a small overlay on
# the base company skeleton (lib/company-starter-packs.ts). Marketing ships 10 of
# upstream's 49, HR 12 of 147, software-engineering 10 of 67, support 1.
set -euo pipefail

PACKS="marketing hr-people software-engineering customer-support"

pack_config() {
  # Defaults: pin by tag, and upstream lays skills out as skills/<id>/SKILL.md.
  # A pack overrides these when its upstream does something else.
  SRC="skills"
  SRC_FILES=0
  case "$1" in
    marketing)
      REPO="coreyhaines31/marketingskills"
      TAG="v2.10.0"
      # product-marketing is load-bearing: it writes the
      # .agents/product-marketing.md context every other skill reads.
      SKILLS="product-marketing marketing-plan copywriting content-strategy seo-audit analytics emails social launch cro"
      ;;
    hr-people)
      REPO="tuanductran/hr-skills"
      TAG="v1.4.0"
      # The People lifecycle a small company actually repeats: hire, onboard,
      # pay, review, keep, exit — plus the policy/compliance floor under it.
      # Upstream also ships its own repo tooling under .agents/skills (biome,
      # bun, turbo); only skills/ is vendored, so that never comes along.
      SKILLS="hr-recruiting hr-job-description hr-interviewing hr-offer-management hr-onboarding hr-offboarding hr-performance-management hr-compensation-benefits hr-employee-relations hr-policy-management hr-compliance hr-employee-engagement"
      ;;
    software-engineering)
      REPO="Jeffallan/claude-skills"
      TAG="v0.4.16"
      # Deliberately STACK-AGNOSTIC, one per stage of this pack's own commands
      # (/plan-feature /write-tests /debug-issue /code-review /prep-release).
      # Upstream's other ~50 skills are language, framework and vendor
      # specialists (rust-engineer, laravel-specialist, shopify-expert): useful
      # to exactly one company each, so they are not in the default set. Add an
      # id here if a company wants its own stack covered.
      SKILLS="spec-miner architecture-designer api-designer feature-forge test-master debugging-wizard code-reviewer security-reviewer code-documenter devops-engineer"
      ;;
    customer-support)
      REPO="wshobson/agents"
      # Pinned to a COMMIT, not a tag: this upstream publishes no tags. Same
      # contract as everywhere else — to update, put a newer SHA here and rerun.
      TAG="d6837ae274c2cd817acad3fb98f193a4390a4c3e"
      # And it ships agent .md FILES rather than skills/<id>/SKILL.md folders,
      # so each id below is a file under SRC that becomes <id>/SKILL.md here.
      SRC="plugins/customer-sales-automation/agents"
      SRC_FILES=1
      SKILLS="customer-support"
      ;;
    *)
      echo "unknown pack: $1 (known: $PACKS)" >&2
      exit 1
      ;;
  esac
}

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
tmp_root="$(mktemp -d)"
trap 'rm -rf "$tmp_root"' EXIT

sync_pack() {
  local pack="$1"
  pack_config "$pack"
  local dest="$repo_root/templates/packs/$pack/.claude/skills"
  local tmp="$tmp_root/$pack"
  mkdir -p "$tmp"

  local slug="${REPO#*/}-${TAG#v}"
  local members=""
  for s in $SKILLS; do
    if [ "$SRC_FILES" = 1 ]; then members="$members $slug/$SRC/$s.md"; else members="$members $slug/$SRC/$s"; fi
  done

  local archive="https://github.com/$REPO/archive/refs/tags/$TAG.tar.gz"
  case "$TAG" in
    [0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]*) archive="https://github.com/$REPO/archive/$TAG.tar.gz" ;;
  esac

  # shellcheck disable=SC2086  # deliberate word splitting: one tar member per skill
  curl -fsSL "$archive" \
    | tar -xzf - -C "$tmp" --strip-components=1 "$slug/LICENSE" $members

  rm -rf "$dest"
  mkdir -p "$dest"
  if [ "$SRC_FILES" = 1 ]; then
    for s in $SKILLS; do
      mkdir -p "$dest/$s"
      cp "$tmp/$SRC/$s.md" "$dest/$s/SKILL.md"
    done
  else
    # evals/ is upstream's own test fixtures — dead weight in a company's repo.
    find "$tmp/$SRC" -type d -name evals -exec rm -rf {} +
    cp -R "$tmp/$SRC/." "$dest/"
  fi

  {
    printf '# Vendored skills\n\n'
    printf 'Source: https://github.com/%s\n' "$REPO"
    printf 'Tag: %s\n' "$TAG"
    printf 'Vendored by: scripts/sync-vendored-skills.sh (do not hand-edit these files)\n\n'
    printf 'Upstream MIT license follows.\n\n---\n\n'
    cat "$tmp/LICENSE"
  } > "$dest/UPSTREAM.md"

  local count=0
  for s in $SKILLS; do
    [ -f "$dest/$s/SKILL.md" ] || { echo "sync failed: no $s/SKILL.md in $REPO at $TAG — renamed or dropped upstream?" >&2; exit 1; }
    count=$((count + 1))
  done
  echo "$pack: vendored $count skills from $REPO at $TAG"
}

# shellcheck disable=SC2086  # $PACKS is a deliberate space-separated list
[ $# -eq 0 ] && set -- $PACKS
for pack in "$@"; do
  sync_pack "$pack"
done
