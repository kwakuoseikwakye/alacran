// Exact relative paths copied from ai-company-starter-main when
// scaffolding a new company. Every path here was individually verified
// to contain no company-specific data (see
// docs/superpowers/specs/2026-07-27-control-panel-v17-create-company-design.md
// for the full audit). Anything not listed here is never copied — this
// is an explicit allowlist, not a blocklist, so newly-added real content
// in ai-company-starter-main can never leak into a new company by
// accident.
//
// definitions/hitl is copied whole-folder because every file in it is
// currently a `<<TODO>>` placeholder template, not filled data — if
// this project ever fills those triggers in with real values in place,
// this entry needs to move to the file-level list below (see
// notes/company/.gitkeep for why: that folder holds real generated
// digests alongside its placeholder, so only the placeholder is listed).
//
// This same manifest is shared by every starter pack (see
// lib/company-starter-packs.ts): the packs only ever add files on top of
// this base skeleton (a tailored ontology, a couple of shape-specific
// commands), never a different folder shape — so one manifest still
// covers all of them.
export const TEMPLATE_MANIFEST: string[] = [
  ".claude/hooks",
  ".claude/commands",
  ".claude/rules",
  ".claude/skills",
  ".claude/settings.json",
  "docs/templates",
  "docs/concepts",
  "docs/ai-company-beginner-guide.md",
  "docs/ai-company-beginner-guide-lp.html",
  "docs/ai-company-explainer.md",
  "docs/context-gathering-checklist.md",
  "docs/directory-map.md",
  "docs/feedback-collection.md",
  "docs/participant-guide.md",
  "docs/retreat-day-flow.md",
  "docs/setup-walkthrough.md",
  "docs/starter-manual.md",
  "docs/decisions/README.md",
  "docs/retros/README.md",
  "exercises",
  "scripts/verify.py",
  "scripts/cycle",
  "tests",
  ".github",
  ".gitignore",
  "LICENSE.md",
  "README.md",
  "CLAUDE.md",
  "definitions/README.md",
  "definitions/ontology/README.md",
  "definitions/hitl",
  "definitions/kpi/README.md",
  "definitions/cycles/README.md",
  "definitions/retro/README.md",
  "secrets",
  "state/README.md",
  "notes/README.md",
  "notes/inbox/README.md",
  "notes/market/.gitkeep",
  "notes/clients/.gitkeep",
  "notes/sops/.gitkeep",
  "notes/company/.gitkeep",
]

export const FRESH_HANDOFF_CONTENT = `# HANDOFF — session handover

This file carries "where things stand and what's next" across sessions. It
implements \`CLAUDE.md\` §2.6 ("Session handover") — the \`/handoff\` command
appends to it at the end of each session.

> **This is the state right after distribution.** No working session has run
> yet. For the first session, start from "Next up" below.

---

## New here? (how to run the first session)

1. Read the start-of-session steps in \`CLAUDE.md\` §5 ("Session flow") — this
   file plus \`CLAUDE.md\` tell you where things currently stand.
2. Start with \`exercises/01\` (the first hands-on exercise).
3. When you're ready to fill in your own company's context, run
   \`/define-company\` to generate \`definitions/ontology/company.yaml\`.
4. After any substantial change, verify with \`python3 scripts/verify.py\`
   (or \`/verify\`) — no fake green.
5. At the end of a session, update this file with \`/handoff\`, and leave a
   record with \`/decision\` or \`/retro\` for anything decided.

---

## Next up

- Run \`/define-company\` to fill in your own company's context.
`
