// Exact relative paths copied from templates/company-starter/ when
// scaffolding a new company. Anything not listed here is never copied —
// an explicit allowlist, not a blocklist, so a file added to the template
// can never reach a new company without being named here.
//
// The template is deliberately small: a scaffold, not a manual. It ships
// the commands the app actually runs, the ontology reference shape
// docs/templates/ontology-starter.yaml (a hard dependency of
// lib/save-company-ontology-impl.ts), one verify script, and empty
// folders with a README explaining what goes in each. Prose about how to
// run a company is not the scaffold's job.
//
// This same manifest is shared by every starter pack (see
// lib/company-starter-packs.ts): the packs only ever add files on top of
// this base skeleton (a tailored ontology, a couple of shape-specific
// commands), never a different folder shape — so one manifest still
// covers all of them.
export const TEMPLATE_MANIFEST: string[] = [
  ".claude/commands",
  ".claude/settings.json",
  "docs/templates",
  "docs/decisions/README.md",
  "docs/retros/README.md",
  "scripts/verify.py",
  // Nothing from ".github" — see v55/v56 in CHANGELOG.md.
  //
  // The workflows folder is the one that mattered: that CI wrapper around
  // scripts/verify.py needs the `workflow` OAuth scope just to be PUSHED at
  // all, which gh's own default `gh auth login` scopes don't include, and it
  // broke literally every new company's first-ever backup. `/verify` already
  // runs scripts/verify.py directly with no CI involved — nothing is lost by
  // not shipping the wrapper.
  //
  // v55 kept ".github/ISSUE_TEMPLATE/config.yml" as the one harmless
  // survivor; v56 dropped it too, because it was a no-op. Its entire content
  // is `blank_issues_enabled: true`, which is GitHub's own default, and v37
  // deleted every issue template it could have been configuring. A new
  // company now gets no .github directory at all.
  ".gitignore",
  "LICENSE.md",
  "README.md",
  "CLAUDE.md",
  "definitions/README.md",
  "definitions/ontology/README.md",
  "definitions/triage/senders.example.yaml",
  "definitions/triage/repos.example.yaml",
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

This file carries "where things stand and what's next" across sessions. The
\`/handoff\` command appends a new section to it at the end of each session.

> **This is a brand-new company.** No working session has run yet. Start from
> "Next up" below.

---

## New here? (how to run the first session)

1. Read \`CLAUDE.md\` §4 ("Session flow"). That file plus this one are the
   whole picture of where things stand.
2. Run \`/define-company\` to write \`definitions/ontology/company.yaml\`.
   This is the real first step — everything else assumes it exists.
3. After any substantial change, run \`/verify\` (or \`python3
   scripts/verify.py\`) and report what it says. No fake green.
4. End the session with \`/handoff\`, and record anything decided with
   \`/decision\` or \`/retro\`.

---

## Next up

- Run \`/define-company\` to fill in your own company's context.
`
