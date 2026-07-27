# v17: Create a company from the template — design spec

## Problem

"Add a company" (v11) only **registers** a directory that already has
`.git` and `.claude` — it cannot create one. A user who types a path that
doesn't exist yet (e.g. a brand-new company name) just gets "Path is not
a git repository (no .git found)". There is currently no way to go from
"just a name" to a working, registered company without leaving the
dashboard and manually scaffolding a directory in a terminal first.

## Bigger picture (context, not this slice's scope)

This control-panel is heading toward being a Fleece.ai-style onboarding
and operations UI built around `ai-company-starter-main` (the "AI company
operating system" template) and `harness-engineering` as the core, with
things like `plh-takeshi-agent` as example "plugin" workflows built on
top of a company once it exists. The full roadmap, in order:

- **v17 (this slice)**: create + register a company from the template.
- **v18 (future, not designed yet)**: guided company-context setup — a UI
  walkthrough that fills in `definitions/ontology/company.yaml` (today's
  `/define-company` command's job) without a terminal.
- **v19 (future, not designed yet)**: integrations setup (email,
  calendar, etc.) so agents can actually act on a company's behalf.
- **v20 (future, not designed yet)**: guided command/workflow discovery,
  possibly formalizing the "plugin" concept (installing a
  `plh-takeshi-agent`-style workflow onto a company).

v17 only builds the first piece. Everything else is named here so the
roadmap is visible, not because it's in scope.

## The agent-agnostic question (designed now, not built)

`ai-company-starter-main`'s automation layer (`.claude/hooks`,
`.claude/commands`, `.claude/skills`) is Claude Code's own packaging
mechanism — genuinely specific to Claude Code, with no equivalent in
ChatGPT or another agent runtime. But the actual *company knowledge* this
template scaffolds — `definitions/` (ontology, HITL triggers, KPIs,
cycles, retro schema), `docs/decisions/`, `docs/retros/`, `notes/` — is
plain YAML/Markdown with no agent-specific syntax at all. Read by a human
or fed to any LLM, it means the same thing regardless of which agent
runtime is acting on it.

**Decision for this project going forward:** the portable, agent-agnostic
core of an "AI-Native company" is `definitions/` + `docs/decisions/` +
`docs/retros/` + `notes/` — the data. `.claude/*` is *one* adapter that
exposes that data to *one* specific agent runtime (Claude Code) via that
runtime's own conventions (slash commands, skills, hooks). A future
ChatGPT-equivalent would need its own adapter (e.g. a custom GPT's
instructions + actions, or whatever ChatGPT's extension mechanism is)
that reads the *same* `definitions/`/`docs/`/`notes/` data and exposes
equivalent workflows in ChatGPT's own idiom — it would not reuse
`.claude/*` at all, but it would read exactly the same company data.

This slice does not build a ChatGPT adapter or an abstraction layer
between them. It scaffolds today's only real adapter (Claude Code's
`.claude/*`) alongside the universal data layer, and documents the split
above so a future adapter has a clear, already-separated target to plug
into instead of having to untangle it first.

## Template curation: `ai-company-starter-main` is a live instance, not a clean template

`ai-company-starter-main` is simultaneously (a) the origin of this
template and (b) the user's own real, working "Kirirom Group Application
Engineering" company. Concretely:

- `definitions/ontology/company.yaml` holds real, filled-in Kirirom
  business data (confirmed by reading it — company summary,
  stakeholders, real entity definitions).
- `HANDOFF.md` (172 lines) holds real accumulated session history (real
  PR numbers, commit hashes, dated entries) beyond its generic
  first-timer preamble.
- `docs/decisions/2026-07-18-ontology-kirirom-pivot.md` is a real
  Kirirom-specific decision; the other 4 files in that folder are
  template-design rationale, not company data.
- `docs/retros/ec-team/weekly/2026-W27.md` is a real retro record.
- `examples/harukaze-ec/` is a teaching demo bundled with the starter,
  not per-company scaffold material.
- `.kiro/specs/ghana-school-management/` and root `requirement.md` are
  leftover artifacts from an unrelated earlier project (confirmed by a
  comment inside `company.yaml` itself referencing this).
- `tools/office/` is a heavy, optional visualization tool with its own
  `node_modules`/`dist` — a "plugin" in this project's own vocabulary,
  not core scaffold.
- Everything under `.claude/` (hooks, commands, rules, skills,
  settings.json) was checked for hardcoded company references (`grep -l
  -i "kirirom\|vkirirom\|sanuki\|takeshi"`) and found clean — genuinely
  generic.
- `definitions/hitl/` (triggers + approver registry) is *already*
  template content — every value is a `<<TODO: ...>>` placeholder, not
  real data — safe to copy wholesale.

**Decision:** rather than restructuring `ai-company-starter-main` itself
(real, separate effort) or requiring a separately-maintained clean
template directory (adds a second thing to keep in sync), this slice
defines an **explicit template manifest** — a hardcoded list of exactly
which relative paths get copied — as a new, reviewable module. Anything
not on the manifest is never touched, so there's no risk of silently
leaking new real content added to `ai-company-starter-main` later. The
manifest needs conscious updating if the source repo's generic parts
change shape, same as any allowlist — an accepted, explicit tradeoff over
a blocklist that could silently miss newly-added real content.

### The manifest

**Copied wholesale (unmodified):**

| Path | Why |
|---|---|
| `.claude/hooks/`, `.claude/commands/`, `.claude/rules/`, `.claude/skills/`, `.claude/settings.json` | Claude Code adapter layer — confirmed generic |
| `docs/templates/`, `docs/concepts/`, and root-level `docs/*.md` (beginner-guide + `.html`, explainer, context-gathering-checklist, directory-map, feedback-collection, participant-guide, retreat-day-flow, setup-walkthrough, starter-manual) | Educational/reference content, no company-specific data |
| `exercises/` | Generic onboarding exercises |
| `scripts/verify.py`, `scripts/cycle/` | Deterministic tooling, agent-agnostic |
| `tests/` | Generic pytest suite for the tooling above |
| `.github/` | Generic issue templates/workflows |
| `.gitignore`, `LICENSE.md`, `README.md` | Generic project scaffolding |
| `CLAUDE.md` (root) | Confirmed generic operating constitution — no Kirirom-specific content |
| `definitions/README.md`, `definitions/ontology/README.md` | Explanatory READMEs, not filled data |
| `definitions/hitl/` (entire folder) | Already template placeholders (`<<TODO>>`), not real data |
| `definitions/kpi/`, `definitions/cycles/`, `definitions/retro/` (entire folders) | Currently README-only in the source anyway |
| `secrets/` (entire folder) | Already gitkeep placeholders only, no real secrets |
| `state/README.md` | No real runtime state present |
| `notes/README.md`, `notes/inbox/README.md`, and the `.gitkeep` in `notes/market/`, `notes/clients/`, `notes/sops/`, `notes/company/` | Structure only, no real notes |
| `docs/decisions/README.md`, `docs/retros/README.md` | Index only, not the real entries inside |

**Generated fresh (not copied from the source file):**

- `HANDOFF.md` — the real file mixes a genuinely generic first-timer
  preamble with 172 lines of real Kirirom session history. Rather than
  parsing/truncating the real file (fragile), the scaffold writes a
  small, fixed HANDOFF.md template (a short embedded string in the
  scaffolding code) containing just the generic "first session" guidance.

**Excluded entirely:**

- `examples/` — teaching demo, not scaffold material
- `.kiro/specs/`, `requirement.md` — leftover unrelated-project artifacts
- `tools/office/` — heavy optional visualization plugin, out of scope
- `definitions/ontology/company.yaml` — real Kirirom data
- `docs/decisions/*.md` (all entries), `docs/retros/**/*.md` (all entries) — real/mixed decision and retro records; a new company starts with empty decision/retro history and accumulates its own via `/decision` and `/retro`
- `notes/company/digests/*` and any other real content under `notes/*` beyond the README/gitkeep listed above
- `.git/` — the new company gets its own fresh `git init`, never the source's history
- `.DS_Store` (anywhere) — macOS cruft

## User-facing flow

Reuses the existing `AddCompanyForm` (v14) — same "Name" + "Local
directory path" fields, same collapsed-by-default disclosure. The
behavior branches on whether the typed path already exists:

1. **Path already exists** — whether it's a fully valid company directory
   (has `.git` + `.claude`) or an invalid one (missing one or both, or
   not even a directory), behaves exactly as today:
   `registerCompanyImpl`'s existing validation and error messages are
   completely unchanged. This slice adds nothing to that path and risks
   no regression to it — it never attempts to repair or scaffold on top
   of an existing, non-empty, invalid directory, too ambiguous a case to
   handle safely.
2. **Path does not exist, but its parent directory does** — instead of
   immediately erroring, the form shows a new confirmation step:
   *"`<path>` doesn't exist yet. Create '`<name>`' here from the
   ai-company-starter-main template?"* with Cancel / Confirm, matching
   this project's established confirm-before-writing pattern (the same
   shape as the skill-editor's save-confirmation dialog, minus the diff
   view — there's nothing to diff against yet). On Confirm: create
   exactly that one leaf directory, copy the manifest into it, write the
   fresh `HANDOFF.md`, `git init` and commit everything, then register
   it via the existing, untouched `registerCompanyImpl`. On Cancel:
   nothing happens, same as today.
3. **Neither the path nor its parent directory exists** — today's
   existing "Path does not exist or is not a directory" error, unchanged.
   This slice creates at most one new leaf directory; it never creates
   arbitrarily deep new nested paths, since that risks silently creating
   directories somewhere the user didn't actually intend (e.g. a typo'd
   path).

The template source directory is `ai-company-starter-main`'s own
`rootPath`, already available from the existing `AGENTS` array in
`lib/config.ts` (`AGENTS.find(a => a.id === "ai-company-starter-main")`)
— no new configuration needed.

## Testing

Following this project's established DI convention, the copy/scaffold
logic takes an injectable template-source path (defaulting to the real
`ai-company-starter-main` rootPath in production) so tests never read
from or depend on that real repo — tests build a small disposable
fixture directory (a handful of files matching the manifest's shape)
under `/tmp` instead, per this project's standing safe-test-target rule.
Unit tests cover: manifest paths get copied byte-for-byte; excluded
paths are never present in the output; the fresh `HANDOFF.md` is written;
`git init` produces a working repo with one commit; the "path already
exists" branch is untouched (existing `registerCompanyImpl` tests keep
passing unchanged). Live verification (Playwright, a disposable `/tmp`
target path) covers the actual UI flow end to end, then the disposable
directory is deleted — never touching `plh-takeshi-agent` or `plh-ops`,
and not writing anywhere inside the real `ai-company-starter-main`
(read-only source access only).

## Non-goals

- No GitHub template / `gh repo create --template` / network dependency
  — this is a fully local, offline copy-and-`git init`.
- No restructuring of `ai-company-starter-main` itself — it stays exactly
  as it is; the manifest works around its current shape.
- No guided company-context UI, no integrations setup, no
  command-discovery UI — those are v18/v19/v20, named above, not designed
  or built here.
- No support for a "plugin" install flow (e.g. adding `plh-takeshi-agent`
  onto a newly created company) — future, unscoped work.
- No editing of an existing registered company's scaffold after creation
  — same limitation v11 already had for registration in general.
