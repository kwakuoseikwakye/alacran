# Day 1 (launch) — de-PLH + bundle template + first-run onboarding — design spec

Day 1 of `LAUNCH.md`'s 4-day push to ship `control-panel` as a downloadable
product. Turns a fresh install into a clean product: **starts empty, ships no
PLH/Kirirom data, assumes no `~/AI-Native/*` path, and onboards the user to
create their first company** — while the developer's own machine keeps full
daily use with zero setup.

Decomposed into **three back-to-back slices** (v23, v24, v25), each its own
tested + merged branch, built in sequence. Locked decisions (from LAUNCH.md):
built-ins load via **directory-existence check**; template is **bundled in the
app**; audience is **CLI-comfortable early adopters** with **detect-and-guide**
dependency onboarding.

## Investigation (coupling map)

37 hardcoded references to the 3 PLH agent ids across 13 non-test files, in
three categories:

1. **Config** (`lib/config.ts`): 3 `AGENTS` at `~/AI-Native/*` + their
   `ADAPTERS`/`SKILL_ADAPTERS` entries. `lib/config.test.ts` asserts these three
   maps stay bidirectionally in sync.
2. **Template source** (`create-company-from-template*.ts`,
   `company-template-manifest.ts`): copies from `~/AI-Native/ai-company-starter-main`.
   **Key finding:** `createCompanyFromTemplateImpl` already accepts a
   `templateSourcePath` parameter — only the public action
   (`create-company-from-template.ts`) hardcodes the path.
3. **Bespoke example-agent features** (`app/page.tsx` + v2/v5/v9/v19/v20 files):
   every one already gates on `agent.id === "..."`, so when those agents aren't
   present the features **silently don't render**. No deletion needed — they go
   dormant. The launch-critical requirement is that a fresh install *shows* no
   PLH agents and *ships* no PLH data, not that the compiled bundle contains
   zero dormant adapter code (that's a later cleanup, not a v1 blocker).

---

## Slice v23 — De-PLH the config

**Goal:** a fresh install has an empty agent list; the developer's machine keeps
all 3 PLH agents with full bespoke features, automatically.

**Design:**

- Extract a pure, testable function
  `buildBuiltins(exists: (absPath: string) => boolean): { agents: Agent[];
  adapters: Record<string, Adapter>; skillAdapters: Record<string, SkillAdapter> }`
  into a new `lib/builtin-agents.ts`. It defines the 3 PLH agent descriptors
  (id, name, rootPath, kind) + their adapter/skill-adapter wiring, and includes
  each agent **only if `exists(agent.rootPath)` is true**. `lib/config.ts` calls
  it with `fs.existsSync` and re-exports the result as `AGENTS` / `ADAPTERS` /
  `SKILL_ADAPTERS` (unchanged export names + shapes — every downstream importer
  keeps working).
- On the dev machine, `~/AI-Native/{plh-takeshi-agent,ai-company-starter-main,plh-ops}`
  exist → all 3 load with their real adapters → full daily use, zero setup. On a
  fresh install none exist → all three maps are empty → the app starts clean.
  A partial machine loads only the present subset.
- The `config.test.ts` drift guard still holds (parity of the two id-sets is true
  for any subset, including empty). Add direct `buildBuiltins` tests with a fake
  `exists`: all-present → 3 agents + 3 of each adapter; none-present → all empty;
  partial → exactly the present subset, with adapter maps matching.
- **Hide broken actions on a fresh install:** the "Install daily-team-log" button
  (v20) reads `plh-ops` from `AGENTS` as its source; with no `plh-ops` present it
  would error if clicked. Gate its visibility in `app/page.tsx` on `plh-ops`
  actually being present in the effective agents (compute
  `const plhOpsSource = agents.find((a) => a.id === "plh-ops")` and require it).
- **Genericize the two cosmetic PLH strings:** the scaffold commit message
  `"Initial commit from ai-company-starter-main template"` →
  `"Initial commit from company starter template"`, and the add-company confirm
  dialog copy `"from the ai-company-starter-main template?"` →
  `"from the company starter template?"`. Update the one impl test asserting the
  old commit message.

**Non-goals:** deleting/extracting the dormant bespoke adapter code (v2/v5/v9/v19/v20
features stay in the repo, dormant when their agent is absent); any change to the
bespoke features' behavior when their agent *is* present.

**Testing:** `buildBuiltins` unit tests (3 gate states); existing `config.test.ts`
passes unchanged; the create-from-template impl test updated for the new commit
message; full suite green.

---

## Slice v24 — Bundle the company-starter template

**Goal:** creating a company works with no `~/AI-Native/*` dependency, offline.

**Design:**

- Create a committed `templates/company-starter/` directory at the repo root,
  populated by copying **exactly the `TEMPLATE_MANIFEST` paths** from the live
  `~/AI-Native/ai-company-starter-main` (a one-time snapshot). v17 already
  audited this manifest as containing zero company-specific data; re-verify with
  a scrub grep (`plh`, `takeshi`, `kirirom`, `owner@example.com`, real absolute
  paths) over the snapshot before committing it.
- Change the public action `lib/create-company-from-template.ts` to pass the
  bundled path (resolved from the app root, e.g.
  `path.join(process.cwd(), "templates", "company-starter")`) as
  `templateSourcePath`, instead of `~/AI-Native/ai-company-starter-main`. The
  impl (`createCompanyFromTemplateImpl`) is **unchanged** — it already takes the
  source path as a parameter.
- Snapshot is intentionally frozen at bundle time (deterministic, offline) — the
  locked "bundle, not clone-on-first-run" decision.

**Known follow-up (not this slice):** in a packaged Electron build (Day 2),
`process.cwd()` may not be the app root; the bundled-template path resolution
will be revisited then. For v24 (dev / `next start`), `process.cwd()`-relative
is correct.

**Non-goals:** changing the manifest contents or the scaffold logic; live-syncing
the template from the source repo.

**Testing:** the existing create-from-template impl test already runs against a
`/tmp` fixture source — point/confirm it still passes; add/confirm a check that
the public action resolves the bundled path. Live-verify by creating a disposable
company from the bundled template and confirming the 4-file structure + no PLH
data, with `~/AI-Native/ai-company-starter-main` untouched (read-only source for
the snapshot only).

---

## Slice v25 — First-run onboarding + dependency detection

**Goal:** an empty install greets the user and tells them exactly what to install.

**Design:**

- New `lib/check-dependencies.ts`: a `"use server"` action `checkDependencies()`
  returning `{ claude: boolean; gog: boolean }`, plus a paired
  `checkDependenciesImpl(execFn?)` that probes each binary (e.g.
  `execFile("which", [name])` — resolves → present, rejects → absent), with an
  injectable `ExecFileFn` for tests. Degrades to `false` on any error, never
  throws past its boundary (project convention).
- New `components/onboarding-welcome.tsx` (client): shown when there are **no
  agents and no registered companies**. Contains a short intro, a
  **dependency checklist** (Claude Code CLI + `gog`, each ✓ present / ✗ with a
  one-line "install this" instruction + link), and the existing `AddCompanyForm`
  as the "create your first company" CTA (reused, not rebuilt).
- `app/page.tsx`: when the effective agent list is empty, render
  `OnboardingWelcome` instead of the empty card grid; otherwise the current grid.
  (Uses the existing `getEffectiveAgents()` result — empty means both no builtins
  and no registered companies.)

**Non-goals:** auto-installing dependencies (detect-and-guide only, per the locked
audience decision); any account/login/license UI (that's Day 3); styling beyond a
clean, plain welcome.

**Testing:** `checkDependenciesImpl` unit tests with a fake execFn (both present /
one missing / both missing); onboarding component has no unit test (project has
no component-level UI tests) — covered by live verification: with an empty
`.data/` and no `~/AI-Native/*`, the app shows the welcome + real dependency
status, and creating a first company transitions to the normal grid.

---

## Sequencing & safety

- Built in order v23 → v24 → v25, each merged before the next (independently
  revertable). v23 makes the app start empty; v24 makes create-company work
  without `~/AI-Native`; v25 makes the empty state a real onboarding.
- Standing safety rule intact: `~/AI-Native/ai-company-starter-main` is read
  **only** as the one-time snapshot source for v24 (read-only, verified clean);
  `plh-takeshi-agent` and `plh-ops` are never written. Live tests use disposable
  `/tmp` companies.
- After Day 1, the developer's own dashboard behaves exactly as before (builtins
  auto-load because the dirs exist) — the only visible change on the dev machine
  is the genericized template strings and the new onboarding never triggering
  (because agents are present).
