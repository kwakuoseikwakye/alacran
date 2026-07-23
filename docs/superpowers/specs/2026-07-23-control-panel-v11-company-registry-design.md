# AI-Native Control Panel — v11 Slice: Register a Second "AI Company"

## Status
Approved for implementation planning (2026-07-23). Scoped autonomously per
standing delegation ("continue with the rest of the features... approve
any recommendation you suggest").

## Problem

Every slice so far (v1-v10, v13) operates on exactly 3 hardcoded agents in
`lib/config.ts`'s `AGENTS` array. The original ask that started this whole
project was for something "unified... reused to create another ai-company
which has different concept" — the dashboard currently has no way to
manage a second company-like instance at all.

Research into how deeply the existing features hardcode agent identity
found a clean split:
- **v3 (skills/commands scanning), v4 (editing), v6 (history), v7
  (revert)** are already fully generic — they iterate whatever `Agent[]`/
  adapter records they're given, with zero per-agent branching in their
  core logic. Two files (`path-guard.ts`, `resolve-known-skill.ts`) are
  the only ones that import the static `AGENTS`/`SKILL_ADAPTERS`
  constants directly rather than receiving them as parameters — everywhere
  else (`get-all-skills.ts`, `get-all-activities.ts`, and all 3 page
  components) already takes agents/adapters as arguments.
- **v5 (Run verify) and v8 (company-commands runner)** are hand-authored
  specifically for `ai-company-starter-main`'s actual `scripts/verify.py`
  and its actual 10 slash-commands. A genuinely different second company
  (different concept, per the original ask) wouldn't have the same
  script or the same commands, so "generalizing" these would mean either
  building a much bigger dynamic-discovery system (parse arbitrary
  `.claude/commands/*.md` files into safe field forms and permission
  scopes automatically) or producing a feature that's silently wrong for
  a company that doesn't match this one's exact shape. Out of scope here.
- `ai-company-starter-main`'s local clone has no `git remote` configured,
  so the dashboard has no way to discover a GitHub template's `owner/repo`
  slug to automate `gh repo create --template`. That would need to be
  supplied by the user, turning "register a company" into "create AND
  register," a bigger, more consequential feature (real GitHub API calls,
  repo creation) than this slice attempts.

## Goals

- A small "Add company" action on the dashboard's home page: name + an
  absolute local directory path to an EXISTING repo the user has already
  created/cloned themselves (e.g. via GitHub's "Use this template" +
  `gh repo clone`, done outside this app). Validates the path exists, is
  a directory, contains `.git` and `.claude`, and doesn't collide with an
  existing agent id.
- Once registered, the new company automatically appears in: the agent
  tree and activity board (v1), the skills/commands browser with full
  editing/history/revert (v3/v4/v6/v7) — via a small "effective agents"
  layer that merges the static 3 with any registered companies, used only
  at the handful of places that need the full list.
- A generic skill adapter (identical logic to `ai-company-starter-main`'s
  existing one — scan `.claude/skills`/`.claude/commands`, already
  content-agnostic) and a new generic activity adapter (recent `git log`
  entries as activities) apply automatically — no per-company code needed
  for a newly registered company to show up correctly.
- A "Remove" action per registered company (un-register only — never
  touches the actual directory/repo).

## Non-goals

- No automated repo creation from a GitHub template — the user brings an
  already-existing local directory; see Problem section for why.
- No generalization of v5's "Run verify" or v8's company-commands runner
  to registered companies — both stay scoped to `ai-company-starter-main`
  only, for the reasons above. A future slice could build a genuinely
  dynamic version if ever needed; not attempted here.
- No editing of a registered company's name/path after creation — remove
  and re-add.
- No support for registering `pipeline`/`report-log`-kind agents — only
  `command-set` (the actual use case here).
- The generic activity adapter's "detail" click-through isn't specially
  handled (a git-log-derived activity has no single natural "file" to
  show) — clicking one will hit the existing file-read error path
  cleanly (a readable error, not a crash) rather than a polished detail
  view. Noted as a known minor rough edge, not blocking.

## Architecture

```
lib/
├── companies-registry.ts          # NEW: CRUD for registered companies
├── get-effective-agents.ts        # NEW: merges AGENTS + registered companies
├── register-company.ts            # NEW: "use server" — zero-domain-param-free action
├── remove-company.ts              # NEW: "use server"
├── skills/
│   ├── generic-command-set.ts     # NEW: extracted, reusable skill adapter
│   └── ai-company-starter-main.ts # MODIFIED: becomes a thin re-export (regression-proven)
├── adapters/
│   └── generic-git-log.ts         # NEW: generic activity adapter
├── path-guard.ts                  # MODIFIED: uses effective agents, not static AGENTS
└── resolve-known-skill.ts         # MODIFIED: uses effective agents/adapters
app/
├── page.tsx                       # MODIFIED: uses effective agents/adapters
├── activity/page.tsx              # MODIFIED: uses effective agents/adapters
└── skills/page.tsx                # MODIFIED: uses effective agents/adapters
components/
├── add-company-form.tsx           # NEW
├── remove-company-button.tsx      # NEW
└── agent-card.tsx                 # MODIFIED: renders remove-company-button for registered companies
```

### `lib/companies-registry.ts`

```ts
export type RegisteredCompany = { id: string; name: string; rootPath: string }
```
- `getRegisteredCompanies(registryPath?: string): Promise<RegisteredCompany[]>` — reads
  `.data/companies.json` (control-panel's own repo, gitignored, same
  "bookkeeping stays in our own app" rule as v8/v9), returns `[]` if
  missing/unparseable (never throws past this boundary).
- `registerCompanyImpl(name, rootPath, registryPath?): Promise<{ok:true, company} | {ok:false, message}>`
  — validates: `name` non-empty; `rootPath` is an absolute path that
  exists, is a directory, and contains both a `.git` and a `.claude`
  entry (reject with a specific message identifying which check failed);
  the generated `id` (via `crypto.randomUUID()`) can't collide with
  anything (trivially true for a fresh UUID, but check against existing
  registrations for the SAME `rootPath` to avoid silent duplicates —
  reject "This directory is already registered" if so). Appends to the
  registry file.
- `removeCompanyImpl(id, registryPath?): Promise<{ok:true} | {ok:false, message}>`
  — removes the matching entry; `{ok:false, message:"Not found"}` if no
  match (idempotent-safe, not an error state worth surfacing loudly).

### `lib/get-effective-agents.ts`

```ts
export async function getEffectiveAgents(): Promise<Agent[]>
export async function getEffectiveAdapters(): Promise<Record<string, Adapter>>
export async function getEffectiveSkillAdapters(): Promise<Record<string, SkillAdapter>>
```
Each merges the static `AGENTS`/`ADAPTERS`/`SKILL_ADAPTERS` from
`lib/config.ts` with registered companies (`kind: "command-set"`), the
latter mapped to `genericGitLogActivityAdapter`/`genericCommandSetSkillAdapter`
respectively.

### `lib/skills/generic-command-set.ts`

The exact existing logic from `lib/skills/ai-company-starter-main.ts`,
extracted so it's reusable:
```ts
export const genericCommandSetSkillAdapter: SkillAdapter = async (agent) => {
  const [skills, commands] = await Promise.all([
    scanSkillsDir(agent.id, path.join(agent.rootPath, ".claude", "skills")),
    scanCommandsDir(agent.id, path.join(agent.rootPath, ".claude", "commands")),
  ])
  return [...skills, ...commands]
}
```
`lib/skills/ai-company-starter-main.ts` becomes a one-line re-export:
`export const aiCompanyStarterMainSkillsAdapter = genericCommandSetSkillAdapter`
— its existing test file (`lib/skills/ai-company-starter-main.test.ts`)
must pass completely UNCHANGED (regression proof, same discipline as
v6/v9's prior extractions).

### `lib/adapters/generic-git-log.ts`

```ts
export const genericGitLogActivityAdapter: Adapter = async (agent) => { ... }
```
Runs `git -C <rootPath> log --format=<parseable-format> -20` (via the
existing `ExecFileFn`-style DI, real default + injectable fake, same as
every other exec-using file in this app), converts each line to an
`Activity` (`id: sha`, `type: "commit"`, `timestamp` from the commit
date, `title` from the commit subject, `status: "done"`, `detailPath:
rootPath` — the known, accepted rough edge from Non-goals). Empty/failed
`git log` → `[]`, not an error (a fresh repo with no commits is a valid
state).

### Server Actions

`lib/register-company.ts` / `lib/remove-company.ts` — zero-extra-parameter
`"use server"` wrappers over the above, following this app's established
split (domain params like `name`/`rootPath`/`id` are fine on the public
boundary; only injectable seams like `registryPath` stay internal-only
with real defaults).

### UI

`components/add-company-form.tsx`: a small form (name + path text
inputs) on the home page, below the existing agent cards, with a
confirm-free direct submit (registering a company is a benign,
completely reversible local action — no destructive side effect,
consistent with why v1/v3's read paths never needed confirmation
dialogs; removal DOES get a confirm dialog since undoing requires
re-typing the path).

`components/remove-company-button.tsx`: small "Remove" button + confirm
dialog on a registered company's `AgentCard`, calling `removeCompany(id)`.

`components/agent-card.tsx` gains a `removable?: boolean` prop (true only
for registered companies, never the 3 built-ins) rendering
`<RemoveCompanyButton id={agent.id} />` when true.

## Error handling

- Every validation failure (missing name, bad path, not-a-directory,
  missing `.git`/`.claude`, duplicate path) returns a specific, typed
  message before any registry-file write — reject-at-the-boundary,
  matching this app's established discipline.
- Registry file read failures degrade to `[]` (empty list), never
  throwing past the module boundary — same as every other adapter/config
  read in this app.
- `genericGitLogActivityAdapter`'s git-log failure degrades to `[]`
  activities, not an error surfaced to the user, since "not a git repo
  with any commits yet" is a legitimate state for a brand-new company.

## Testing

- `lib/companies-registry.ts`: unit tests with real temp-dir fixtures for
  every validation branch (missing name, nonexistent path, not-a-dir,
  missing `.git`, missing `.claude`, duplicate `rootPath`, successful
  registration and removal), never touching a real `.data/companies.json`.
- `lib/get-effective-agents.ts`: unit tests confirming the merge is
  correct (static 3 + N registered, correct `kind`/adapter mapping).
- `lib/skills/ai-company-starter-main.test.ts` (existing, unmodified)
  must pass completely as-is after the re-export change — regression
  proof.
- `lib/adapters/generic-git-log.ts`: unit tests with a fake exec function
  and real temp-dir git fixtures (or an injected fake — no real `git`
  binary dependency needed for the parsing logic itself).
- **Correction from an initial assumption, caught during spec review**:
  `path-guard.ts`/`resolve-known-skill.ts`'s existing test files mock
  `./config`'s `AGENTS`/`SKILL_ADAPTERS` directly today
  (`vi.doMock("./config", () => ({ AGENTS: [...] }))`). Once these files
  call `getEffectiveAgents()` instead of importing `AGENTS` directly,
  Vitest's module mocking still reaches `./config` transitively (mocking
  is graph-wide, not just direct importers) — BUT `getEffectiveAgents()`
  also calls `getRegisteredCompanies()`, which reads a REAL file
  (`.data/companies.json`) by default unless that module is ALSO mocked.
  Without an additional mock, these existing tests would non-
  deterministically pick up whatever companies happen to be registered
  on the machine running the test — unacceptable. So these two existing
  test files DO need one additive line each
  (`vi.doMock("./companies-registry", () => ({ getRegisteredCompanies: async () => [] }))`),
  not zero changes. This is a legitimate, minimal, behavior-preserving
  addition (asserting "zero registered companies" explicitly, which is
  the implicit assumption those tests already relied on) — not a
  regression, but also not the "completely unchanged" bar this project
  usually holds for extractions. Call this out explicitly to any reviewer
  rather than let it look like an unexplained deviation.
- Manual live-test (real, required): register a genuinely new local
  directory (e.g. create a fresh temp git repo with a `.claude/skills/`
  and one trivial skill, in `/tmp` or similar — NOT inside
  `~/AI-Native/`, to keep it obviously separate from the real 3 agents)
  as a company, confirm it appears in the agent tree, activity board, and
  skills browser, confirm editing/history/revert work against it for
  real, then remove it and confirm it disappears and the temp directory
  is untouched on disk.
