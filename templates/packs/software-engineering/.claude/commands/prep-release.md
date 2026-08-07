---
name: prep-release
description: Assemble release notes for a product.release from what actually merged since the last tag, categorized by type, before anything is tagged or announced
---

# /prep-release

Turn what actually merged since the last release into notes a user could read — not a raw
commit log, and not written before checking what actually shipped.

## How to proceed

1. Find the last release: the most recent git tag (`git tag --sort=-creatordate | head -1`), or
   the latest entry under `product.release` in `definitions/ontology/company.yaml` if this repo
   doesn't tag.
2. Collect everything merged since then — `git log <last-tag>..HEAD --oneline`, or
   `gh pr list --state merged --search "merged:>=<date>"` for a GitHub-PR-based repo. Read each
   entry; don't just paste the raw log into the notes.
3. Categorize by the Conventional Commits types this starter already uses
   (`.claude/rules/issue-first.md` §5) — group `feat` / `fix` / `docs` / `refactor` / `chore`
   separately, and drop pure `chore` entries from the user-facing notes unless one is genuinely
   notable to a user.
4. Write the notes in plain language, one line per change, from the user's perspective ("Fixed
   X" not "refactored the Y validator") — cross-reference the Issue or PR number so a reader can
   find the detail if they want it.
5. Draft the new `product.release` entry (`version`, `repo_id`, `shipped_at`) per
   `.claude/rules/definitions-touch.md`, and show both the release notes and the ontology diff to
   the user before writing either.
6. Tagging, publishing, or announcing the release itself goes through
   `.claude/rules/hitl-gate.md` (the Publication row) — this command only drafts the notes; it
   does not tag, push, or announce anything.

## Notes

- If nothing merged since the last release, say so — don't manufacture release notes for an
  empty release.
- Don't guess at an unclear change's user-facing impact from the commit message alone; if it
  isn't obvious, ask rather than inventing a plausible-sounding line.
