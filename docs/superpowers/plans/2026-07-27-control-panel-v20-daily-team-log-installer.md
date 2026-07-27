# v20: install the daily-team-log workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Session note:** this session's subagent-spawn cap (200/session) has
> been hit repeatedly (v14, v16, v17, v18, v19). If a task's implementer
> dispatch fails with a spawn-limit error, do not retry — execute that
> task (and any remaining tasks) directly instead: read the target file
> first, apply the step's code exactly, run the listed test commands,
> then self-review the whole branch before merging.

**Goal:** Add an "Install daily-team-log" action to any `command-set`
agent's card that doesn't already have it — copies the workflow's
generic extractor script verbatim from `plh-ops`, and generates two
adapted instruction files (pointed at the installing company's own repo,
not `plh-ops`'s shared one).

**Architecture:** A pure module builds the two adapted files
(`SKILL.md`, `Setup.md`) and lists the verbatim-copy manifest; an impl
function resolves both the source (`plh-ops`) and target company
server-side, does the copy + generate + write, and commits via the
existing `commitFile` helper — the same shape as v17's
`createCompanyFromTemplateImpl` and v18's `saveCompanyOntologyImpl`.

**Tech Stack:** `node:fs/promises`, Vitest. No new dependencies.

## Global Constraints

- No changes to `plh-ops`'s real `daily-team-log` files — read-only
  source for the verbatim-copy step.
- No changes to `plh-takeshi-agent` or `ai-company-starter-main`'s own
  files.
- The generated `SKILL.md` must not contain the literal strings "PLH"
  or "Takeshi" (case-insensitive); the generated `Setup.md` must not
  contain "takeman555", "plh-ops", or the names "Eito"/"Lucce"/"Nana"
  (case-insensitive) — these are exactly the PLH-specific residue the
  spec identified as actively wrong to carry into another company.
- The known global-config-collision limitation (see spec) is disclosed
  in the generated `SKILL.md`'s own text — not fixed in this slice.
- Tests never read from or write to the real `plh-ops` directory — a
  disposable `/tmp` fixture standing in for it, per this project's
  standing safe-test-target rule.

---

### Task 1: Daily-team-log file builders

**Files:**
- Create: `lib/daily-team-log-files.ts`
- Test: `lib/daily-team-log-files.test.ts`

**Interfaces:**
- Produces: `export const DAILY_TEAM_LOG_MANIFEST: string[]` (paths
  copied verbatim from `plh-ops`'s rootPath), `export const
  DAILY_TEAM_LOG_SETUP_MD: string` (a fixed constant — needs no
  per-company substitution), and `export function
  buildDailyTeamLogSkillMd(companyName: string): string` — Task 3's impl
  file imports all three.

- [ ] **Step 1: Write the failing tests**

Create `lib/daily-team-log-files.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { buildDailyTeamLogSkillMd, DAILY_TEAM_LOG_SETUP_MD, DAILY_TEAM_LOG_MANIFEST } from "./daily-team-log-files"

describe("daily-team-log-files", () => {
  it("DAILY_TEAM_LOG_MANIFEST lists exactly the two verbatim-copy source files", () => {
    expect(DAILY_TEAM_LOG_MANIFEST).toEqual([
      "workflow/daily-team-log/gather.py",
      "workflow/daily-team-log/config.example.json",
    ])
  })

  it("buildDailyTeamLogSkillMd embeds the company name in the output template's business field", () => {
    const md = buildDailyTeamLogSkillMd("Second Co")
    expect(md).toContain("business: Second Co")
  })

  it("buildDailyTeamLogSkillMd contains no PLH- or Takeshi-specific references", () => {
    const md = buildDailyTeamLogSkillMd("Second Co")
    expect(md).not.toMatch(/PLH/i)
    expect(md).not.toMatch(/Takeshi/i)
  })

  it("DAILY_TEAM_LOG_SETUP_MD contains no plh-ops-specific references", () => {
    expect(DAILY_TEAM_LOG_SETUP_MD).not.toMatch(/takeman555/i)
    expect(DAILY_TEAM_LOG_SETUP_MD).not.toMatch(/plh-ops/i)
    expect(DAILY_TEAM_LOG_SETUP_MD).not.toMatch(/Eito|Lucce|Nana/)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/daily-team-log-files.test.ts`
Expected: FAIL — `Cannot find module './daily-team-log-files'`

- [ ] **Step 3: Implement**

Create `lib/daily-team-log-files.ts`:

```ts
export const DAILY_TEAM_LOG_MANIFEST: string[] = [
  "workflow/daily-team-log/gather.py",
  "workflow/daily-team-log/config.example.json",
]

export function buildDailyTeamLogSkillMd(companyName: string): string {
  return `---
name: daily-team-log
description: Generate the daily team report from this machine's Claude Code session history, in this company's daily report format. Use when asked to "write today's report", "daily report", "daily team log", or when the daily-team-log scheduled task runs unattended. On first run it bootstraps via Setup.md (auto-detects who you are + which projects, then asks). Extracts the day's sessions with gather.py (zero token cost), summarizes them into the fixed English daily-report template under reports/<person>/, commits (and pushes, if this repo has a remote).
---

# Daily Team Report (from Claude Code history)

On each person's machine, turn that day's Claude Code history into a **daily report for ${companyName}** and commit it.
Nobody shares their local context; only the **one-file-per-day report** is shared into the repo.
Runs the same way from the \`daily-team-log\` scheduled task and when invoked manually.

> Path notation: \`<workflow>\` = the folder this SKILL.md lives in (\`.claude/skills/daily-team-log/\` in this repo).
> \`<output_repo>\` = \`output_repo\` from config.json (this repo's own \`reports/\` folder). \`<person>\` = \`person\` from config.json (your name).
> The unattended routine fills these in as absolute paths; for manual runs, derive them from config.json as above.

## What's in this skill

- Script: \`<workflow>/gather.py\` (zero-token extractor)
- First-time setup: \`<workflow>/Setup.md\` (auto-detects person + projects and confirms)
- Config (per-user): \`~/.claude/daily-team-log/config.json\`
  - \`person\` - your name (= the folder under \`reports/\`)
  - \`output_repo\` - this repo's own \`reports/\` folder
  - \`projects\` - allowlist of project names you're willing to share (never include NDA work; \`["*"]\` = all)
  - \`timezone\` / \`lookback_days\` / \`bootstrapped\`

## 0. Bootstrap check (always first)

Read \`~/.claude/daily-team-log/config.json\`. If it is **missing, or \`bootstrapped\` is not \`true\`**, this machine is not set up yet:

- -> Run the \`Setup.md\` flow first (auto-detect person + projects -> confirm -> write config.json -> register routine), and **do not generate a report this run**.
- If an unattended run hits this state, reply \`"not set up - run Setup.md first"\` and stop (do not ask questions).

Once \`bootstrapped: true\` is confirmed, read \`person\` / \`output_repo\` and continue with the steps below.

## Steps

> First, sync the repo (if it has a remote): \`git -C <output_repo> pull --rebase --autostash\`. If it fails (offline or no remote), continue.

### 1. List the dates that need a report

\`\`\`
python3 <workflow>/gather.py pending
\`\`\`

If nothing prints, finish with "no reports to write". Within \`lookback_days\`, this returns dates that had Claude Code activity but have no report yet (so days the app was closed get backfilled later).

### 2. For each date, summarize into the fixed template and write it

For each date, one at a time:

\`\`\`
python3 <workflow>/gather.py digest --date <YYYY-MM-DD>
\`\`\`

Summarize the returned digest into the **fixed English template** below and write it to \`<output_repo>/<person>/<YYYY-MM-DD>.md\`.
**Keep every heading and front-matter key exactly as written.**

### 3. Commit (and push, if this repo has a remote)

\`\`\`
git -C <output_repo> add <person>/<YYYY-MM-DD>.md
git -C <output_repo> commit -m "auto(daily-log): <YYYY-MM-DD> <person>"
git -C <output_repo> pull --rebase --autostash
git -C <output_repo> push
\`\`\`

- Never \`git add -A\`. Only your own file for that day.
- If the push is rejected by a concurrent push, run \`pull --rebase --autostash\` then \`push\` one more time.
- If this repo has no remote configured, or pull/push fails (e.g. offline), keep the commit, report the error in one line, and move to the next date (don't stop).

## Output template (fixed, English)

\`\`\`markdown
---
date: <YYYY-MM-DD>
author: <person>
business: ${companyName}
status: submitted
hours:
tags: []
needs_review: false
---

# <YYYY-MM-DD> — Daily Report (<person>)

## Summary


## Done today
- 

## In progress
- 

## Blockers / needs decision
- 

## Plan for tomorrow
- 

## Claude session summary
- **Topic:** 
  - 

## Numbers / results
- 
\`\`\`

## Summarization guidance (digest -> template mapping)

- **Write in English.** \`<person>\` is the config person; \`<YYYY-MM-DD>\` is the target day.
- **Headings and front-matter keys are fixed.** Keep every section (use \`- none\` if empty).
- Mapping:
  - **Summary** - 2-3 lines. The day's central theme and result.
  - **Done today** - what was completed (the digest's deliverables, commits, finished work).
  - **In progress** - started but unfinished; add a one-line status each.
  - **Blockers / needs decision** - where you're stuck or where a decision-maker must decide. Write \`none\` if none. **If there is a real item here, set \`needs_review: true\` in the front matter.**
  - **Plan for tomorrow** - next steps (from "next" mentions in the session, etc.).
  - **Claude session summary** - \`Topic:\` with the day's topic, then bullets of what was explored / produced.
  - **Numbers / results** - optional. Files touched, commit counts, anything quantitative. \`- none\` if nothing.
- **Summarize, don't paste.** Compress long exchanges down to meaningful outcomes.
- Never write tokens, API keys, or customer personal data. Never write confidential financial or legal data.
- Do not use an em dash; use " - ".

## Unattended-run rules

- Don't ask questions. If one date fails, continue with the rest.
- At the end, report the dates you wrote in one line.

## Known limitation

This skill's config lives at a fixed, global, per-machine path
(\`~/.claude/daily-team-log/config.json\`) — not scoped per-installation.
If this machine already has \`daily-team-log\` bootstrapped for a
different company or repo, running \`Setup.md\` here will overwrite that
shared config rather than keeping them independent. Only one
installation of this skill can be actively bootstrapped per machine at
a time.
`
}

export const DAILY_TEAM_LOG_SETUP_MD = `# Daily Team Report - First-time setup (bootstrap)

Runs **once per machine**, the first time this skill is invoked.
It auto-detects "who you are (person)" and "which projects to share (projects)", then writes config.json and registers the routine: **auto-detect -> confirm -> write config.json -> register routine**.

> When it runs: from the \`SKILL.md\` "## 0" check, when \`~/.claude/daily-team-log/config.json\` is missing or \`bootstrapped\` is not \`true\`.
> After it completes, normal daily runs skip this flow.
> Prerequisites: none beyond this repo already existing locally (it does — you're reading this from inside it).

---

## Step 0. Detect

This repo's own \`reports/\` folder is the \`output_repo\` target — nothing to clone. Detect using the gather.py in this skill folder:

\`\`\`
python3 <workflow>/gather.py detect
\`\`\`

It returns JSON. Fields you use:
- \`person_guess\` - a name guessed from git/OS (a starting point, not necessarily correct)
- \`current_project\` - the project Claude is currently launched in (the default candidate to share)
- \`config_path\` - where to write config (\`~/.claude/daily-team-log/config.json\`)
- \`candidates[]\` - every project with recorded sessions (\`project / sessions / last_active / is_current\`, newest first)
- \`kit_dir\` / \`gather_path\` / \`skill_md_path\` - absolute paths to bake into the routine prompt
- \`already_bootstrapped\` - if true, say "already set up" and stop

## Step 1. Confirm "who are you" (ask)

Show \`person_guess\`, then confirm with **AskUserQuestion**. This becomes the folder name under \`output_repo\`.

- Question: "Whose name should this machine's reports be filed under? (detected: <person_guess>)"
- Options: \`person_guess\` (if set) + Other (free text).

Use the confirmed value as \`person\`.

## Step 2. Confirm "which projects to share" (ask)

Show \`candidates\`. **For NDA safety, default to the minimum** (only the \`is_current\` project) and recommend it.

- Display each candidate as \`project (N sessions, last <last_active>)\`. Annotate \`is_current: true\` with "<- current project".
- Question: "Which projects should be included in the daily report? (do not include client-confidential / NDA work)"
- **AskUserQuestion (multiSelect: true)**. Put \`is_current\` first (recommended), plus the few most-recent candidates.
- Add a note: "to include everything, choose Other and enter \`*\`".

Use the chosen \`project\` array as \`projects\` (\`["*"]\` if \`*\`).

## Step 3. Write config.json

Write to \`config_path\` (\`~/.claude/daily-team-log/config.json\`). Create the parent folder first if needed:

\`\`\`
mkdir -p ~/.claude/daily-team-log
\`\`\`

Content:

\`\`\`json
{
  "person": "<confirmed name>",
  "projects": ["<chosen project>", "..."],
  "output_repo": "<this repo's absolute path>/reports",
  "timezone": "Asia/Tokyo",
  "lookback_days": 3,
  "bootstrapped": true
}
\`\`\`

- \`output_repo\` is this repo's own \`reports/\` folder (create it if it doesn't exist yet).
- Always include \`bootstrapped: true\` (so setup is skipped next time).

## Step 4. Create the folder and verify

\`\`\`
mkdir -p <output_repo>/<person>
python3 <workflow>/gather.py pending
\`\`\`

- If \`pending\` returns dates, it works. Run \`digest --date <date>\` for one day and eyeball that only the intended projects are included.
- If something unexpected is included, fix \`projects\`.

## Step 5. Register the routine (scheduled task) automatically

Actually **create** the scheduled task here (don't make the user touch the GUI).

**Use the LOCAL scheduled-tasks MCP tool for this: \`mcp__scheduled-tasks__create_scheduled_task\`. Do NOT use the cloud \`/schedule\` skill or \`CronCreate\` - cloud agents can't read this machine's \`~/.claude/projects\`, so the job would produce nothing. If the tool isn't loaded, find it by its exact name via tool search (\`select:mcp__scheduled-tasks__create_scheduled_task\`).**

1. Check whether \`daily-team-log\` exists with \`mcp__scheduled-tasks__list_scheduled_tasks\`:
   - If absent, \`mcp__scheduled-tasks__create_scheduled_task\`; if present, \`mcp__scheduled-tasks__update_scheduled_task\`.
2. Parameters:
   - \`taskId\`: \`daily-team-log\`
   - \`description\`: \`Generate and commit the daily team Claude Code report (<person>)\`
   - \`cronExpression\`: \`0 22 * * *\` (daily 22:00, machine local time)
   - \`prompt\`: the template below with **\`<workflow>\` / \`<person>\` / \`<output_repo>\` / \`<gather_path>\` / \`<skill_md_path>\` replaced by the confirmed values** (leave \`<DATE>\` as-is; the routine fills it per date). The routine is unattended, so use absolute paths.

### Routine prompt template (substitute and pass)

\`\`\`
You are running the daily team-alignment report job, unattended. Do not ask questions; handle errors gracefully.

0. Sync the repo first (if it has a remote):
   git -C <output_repo> pull --rebase --autostash
   If this fails (offline or no remote), continue with local state.

1. Run this exact command and read its output:
   python3 <gather_path> pending
2. If it prints nothing, reply "no reports to write" and stop.
3. Otherwise, for each printed date (YYYY-MM-DD), one at a time:
   a. Read <skill_md_path> and follow it exactly.
   b. Get that day's clean digest:
      python3 <gather_path> digest --date <DATE>
   c. Summarize the digest into the FIXED ENGLISH daily-report template defined in SKILL.md (front matter + Summary / Done today / In progress / Blockers - needs decision / Plan for tomorrow / Claude session summary / Numbers - results). Keep every heading and front-matter key EXACTLY. It must be a summary, not a paste of the raw log.
   d. Write it to: <output_repo>/<person>/<DATE>.md
   e. Commit ONLY that file:
      git -C <output_repo> add <person>/<DATE>.md
      git -C <output_repo> commit -m "auto(daily-log): <DATE> <person>"
4. Push, if this repo has a remote (retry once on race):
   git -C <output_repo> pull --rebase --autostash && git -C <output_repo> push
   If push is rejected, run that same pull --rebase + push line ONE more time.
   If there's no remote, skip this step.
5. When finished, report which dates you wrote in one line.

Rules:
- English output.
- Never use an em dash; use " - ".
- Do not write any tokens, API keys, customer personal data, or confidential financial/legal data into the report.
- If one date fails, skip it and continue. Never use git add -A.
\`\`\`

3. Once registered, tell the user: "Press **Scheduled -> daily-team-log -> Run now** once to pre-approve Bash/Read/Write so unattended runs don't pause on permissions."

---

## Completion signal

\`Setup complete: person=<name> / projects=<array> / output=<output_repo> / routine=registered (daily 22:00)\`

From then on, the routine runs the normal \`SKILL.md\` flow (pull -> pending -> digest -> summarize -> write -> commit -> push) every day. Invoking it manually does the same.
`
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/daily-team-log-files.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Type-check and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors

Run: `npx vitest run`
Expected: all tests pass (220 existing + 4 new = 224)

- [ ] **Step 6: Commit**

```bash
git add lib/daily-team-log-files.ts lib/daily-team-log-files.test.ts
git commit -m "feat: add daily-team-log file builders (verbatim manifest + adapted SKILL.md/Setup.md)"
```

---

### Task 2: `dailyTeamLogInstalled`

**Files:**
- Create: `lib/daily-team-log-installed.ts`
- Test: `lib/daily-team-log-installed.test.ts`

**Interfaces:**
- Produces: `export async function dailyTeamLogInstalled(rootPath:
  string): Promise<boolean>` — Task 4 calls this from `app/page.tsx`.

- [ ] **Step 1: Write the failing tests**

Create `lib/daily-team-log-installed.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { dailyTeamLogInstalled } from "./daily-team-log-installed"

let root: string

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "daily-team-log-installed-"))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("dailyTeamLogInstalled", () => {
  it("returns false when .claude/skills/daily-team-log/gather.py is missing", async () => {
    expect(await dailyTeamLogInstalled(root)).toBe(false)
  })

  it("returns true when .claude/skills/daily-team-log/gather.py exists", async () => {
    const skillDir = path.join(root, ".claude", "skills", "daily-team-log")
    await mkdir(skillDir, { recursive: true })
    await writeFile(path.join(skillDir, "gather.py"), "# gather.py\n")
    expect(await dailyTeamLogInstalled(root)).toBe(true)
  })

  it("returns false when the .claude directory doesn't exist at all", async () => {
    expect(await dailyTeamLogInstalled(path.join(root, "does-not-exist"))).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/daily-team-log-installed.test.ts`
Expected: FAIL — `Cannot find module './daily-team-log-installed'`

- [ ] **Step 3: Implement**

Create `lib/daily-team-log-installed.ts`:

```ts
import { stat } from "node:fs/promises"
import path from "node:path"

export async function dailyTeamLogInstalled(rootPath: string): Promise<boolean> {
  try {
    await stat(path.join(rootPath, ".claude", "skills", "daily-team-log", "gather.py"))
    return true
  } catch {
    return false
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/daily-team-log-installed.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run`
Expected: all tests pass (224 existing + 3 new = 227)

- [ ] **Step 6: Commit**

```bash
git add lib/daily-team-log-installed.ts lib/daily-team-log-installed.test.ts
git commit -m "feat: add dailyTeamLogInstalled helper"
```

---

### Task 3: `installDailyTeamLogImpl` and the public Server Action

**Files:**
- Create: `lib/install-daily-team-log-impl.ts`
- Create: `lib/install-daily-team-log.ts`
- Test: `lib/install-daily-team-log-impl.test.ts`

**Interfaces:**
- Consumes: `DAILY_TEAM_LOG_MANIFEST`, `DAILY_TEAM_LOG_SETUP_MD`,
  `buildDailyTeamLogSkillMd` (Task 1); `AGENTS` (existing, from
  `./config`, unchanged); `getEffectiveAgents` (existing, from
  `./get-effective-agents`, unchanged); `commitFile`, `ExecFileFn`
  (existing, from `./git-commit-file`, unchanged).
- Produces: `export async function installDailyTeamLogImpl(agentId:
  string, execFn?: ExecFileFn): Promise<{ ok: true } | { ok: false;
  message: string }>` and, wrapping it, `export async function
  installDailyTeamLog(agentId: string): Promise<{ ok: true } | { ok:
  false; message: string }>` — Task 4's button component calls
  `installDailyTeamLog` directly.

- [ ] **Step 1: Write the failing tests**

Create `lib/install-daily-team-log-impl.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, mkdir, writeFile, rm, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type { ExecFileFn } from "./git-commit-file"

let plhOpsRoot: string
let targetRoot: string
let execCalls: { command: string; args: string[] }[]

const fakeExecFn: ExecFileFn = async (command, args) => {
  execCalls.push({ command, args })
  return { stdout: "", stderr: "" }
}

beforeEach(async () => {
  plhOpsRoot = await mkdtemp(path.join(tmpdir(), "plh-ops-fixture-"))
  targetRoot = await mkdtemp(path.join(tmpdir(), "target-co-"))
  execCalls = []

  await mkdir(path.join(plhOpsRoot, "workflow", "daily-team-log"), { recursive: true })
  await writeFile(path.join(plhOpsRoot, "workflow", "daily-team-log", "gather.py"), "# gather.py contents\n")
  await writeFile(
    path.join(plhOpsRoot, "workflow", "daily-team-log", "config.example.json"),
    JSON.stringify({ person: null, projects: [], output_repo: null })
  )
})

afterEach(async () => {
  await rm(plhOpsRoot, { recursive: true, force: true })
  await rm(targetRoot, { recursive: true, force: true })
  vi.resetModules()
})

async function mockAgents() {
  vi.doMock("./config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./config")>()
    return {
      ...actual,
      AGENTS: [
        { id: "plh-ops", name: "PLH Ops", rootPath: plhOpsRoot, kind: "report-log" },
        { id: "second-co", name: "Second Co", rootPath: targetRoot, kind: "command-set" },
      ],
    }
  })
}

describe("installDailyTeamLogImpl", () => {
  it("copies gather.py and config.example.json verbatim into .claude/skills/daily-team-log", async () => {
    await mockAgents()
    const { installDailyTeamLogImpl } = await import("./install-daily-team-log-impl")

    const result = await installDailyTeamLogImpl("second-co", fakeExecFn)

    expect(result).toEqual({ ok: true })
    const skillDir = path.join(targetRoot, ".claude", "skills", "daily-team-log")
    expect(await readFile(path.join(skillDir, "gather.py"), "utf-8")).toBe("# gather.py contents\n")
    const config = JSON.parse(await readFile(path.join(skillDir, "config.example.json"), "utf-8"))
    expect(config).toEqual({ person: null, projects: [], output_repo: null })
  })

  it("writes a SKILL.md with the target company's name and no PLH/Takeshi references", async () => {
    await mockAgents()
    const { installDailyTeamLogImpl } = await import("./install-daily-team-log-impl")

    await installDailyTeamLogImpl("second-co", fakeExecFn)

    const skillMd = await readFile(
      path.join(targetRoot, ".claude", "skills", "daily-team-log", "SKILL.md"),
      "utf-8"
    )
    expect(skillMd).toContain("business: Second Co")
    expect(skillMd).not.toMatch(/PLH/i)
    expect(skillMd).not.toMatch(/Takeshi/i)
  })

  it("writes a Setup.md with no plh-ops-specific references", async () => {
    await mockAgents()
    const { installDailyTeamLogImpl } = await import("./install-daily-team-log-impl")

    await installDailyTeamLogImpl("second-co", fakeExecFn)

    const setupMd = await readFile(
      path.join(targetRoot, ".claude", "skills", "daily-team-log", "Setup.md"),
      "utf-8"
    )
    expect(setupMd).not.toMatch(/takeman555/i)
    expect(setupMd).not.toMatch(/plh-ops/i)
    expect(setupMd).not.toMatch(/Eito|Lucce|Nana/)
  })

  it("commits the installed skill directory via the injected exec function", async () => {
    await mockAgents()
    const { installDailyTeamLogImpl } = await import("./install-daily-team-log-impl")

    await installDailyTeamLogImpl("second-co", fakeExecFn)

    const relativeSkillDir = path.join(".claude", "skills", "daily-team-log")
    expect(execCalls).toEqual([
      { command: "git", args: ["-C", targetRoot, "add", "--", relativeSkillDir] },
      {
        command: "git",
        args: [
          "-C",
          targetRoot,
          "commit",
          "-m",
          "Install daily-team-log via AI-Native control panel",
          "--",
          relativeSkillDir,
        ],
      },
    ])
  })

  it("fails cleanly for an unknown agent id", async () => {
    await mockAgents()
    const { installDailyTeamLogImpl } = await import("./install-daily-team-log-impl")

    const result = await installDailyTeamLogImpl("no-such-agent", fakeExecFn)

    expect(result).toEqual({ ok: false, message: "Unknown company" })
    expect(execCalls).toEqual([])
  })

  it("is idempotent - installing twice overwrites cleanly without erroring", async () => {
    await mockAgents()
    const { installDailyTeamLogImpl } = await import("./install-daily-team-log-impl")

    const first = await installDailyTeamLogImpl("second-co", fakeExecFn)
    const second = await installDailyTeamLogImpl("second-co", fakeExecFn)

    expect(first).toEqual({ ok: true })
    expect(second).toEqual({ ok: true })
    const skillDir = path.join(targetRoot, ".claude", "skills", "daily-team-log")
    expect(await readFile(path.join(skillDir, "gather.py"), "utf-8")).toBe("# gather.py contents\n")
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run lib/install-daily-team-log-impl.test.ts`
Expected: FAIL — `Cannot find module './install-daily-team-log-impl'`

- [ ] **Step 3: Implement**

Create `lib/install-daily-team-log-impl.ts`:

```ts
import { writeFile, mkdir, cp, stat } from "node:fs/promises"
import path from "node:path"
import { getEffectiveAgents } from "./get-effective-agents"
import { AGENTS } from "./config"
import { DAILY_TEAM_LOG_MANIFEST, DAILY_TEAM_LOG_SETUP_MD, buildDailyTeamLogSkillMd } from "./daily-team-log-files"
import { commitFile } from "./git-commit-file"
import type { ExecFileFn } from "./git-commit-file"

async function pathExists(p: string): Promise<boolean> {
  try {
    await stat(p)
    return true
  } catch {
    return false
  }
}

export async function installDailyTeamLogImpl(
  agentId: string,
  execFn?: ExecFileFn
): Promise<{ ok: true } | { ok: false; message: string }> {
  const plhOpsAgent = AGENTS.find((a) => a.id === "plh-ops")
  if (!plhOpsAgent) {
    return { ok: false, message: "Source workflow (plh-ops) is not configured" }
  }

  const agents = await getEffectiveAgents()
  const agent = agents.find((a) => a.id === agentId)
  if (!agent) {
    return { ok: false, message: "Unknown company" }
  }

  const skillDir = path.join(agent.rootPath, ".claude", "skills", "daily-team-log")

  try {
    await mkdir(skillDir, { recursive: true })

    for (const relativePath of DAILY_TEAM_LOG_MANIFEST) {
      const source = path.join(plhOpsAgent.rootPath, relativePath)
      if (!(await pathExists(source))) continue
      const target = path.join(skillDir, path.basename(relativePath))
      await cp(source, target)
    }

    await writeFile(path.join(skillDir, "SKILL.md"), buildDailyTeamLogSkillMd(agent.name), "utf-8")
    await writeFile(path.join(skillDir, "Setup.md"), DAILY_TEAM_LOG_SETUP_MD, "utf-8")
  } catch (err) {
    return {
      ok: false,
      message: `Failed to install daily-team-log: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  const relativeSkillDir = path.join(".claude", "skills", "daily-team-log")
  await commitFile(agent.rootPath, relativeSkillDir, "Install daily-team-log via AI-Native control panel", execFn)

  return { ok: true }
}
```

Create `lib/install-daily-team-log.ts`:

```ts
"use server"

import { installDailyTeamLogImpl } from "./install-daily-team-log-impl"

export async function installDailyTeamLog(
  agentId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  return installDailyTeamLogImpl(agentId)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run lib/install-daily-team-log-impl.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Type-check and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors

Run: `npx vitest run`
Expected: all tests pass (227 existing + 6 new = 233)

- [ ] **Step 6: Commit**

```bash
git add lib/install-daily-team-log-impl.ts lib/install-daily-team-log.ts lib/install-daily-team-log-impl.test.ts
git commit -m "feat: add installDailyTeamLogImpl and its public Server Action"
```

---

### Task 4: `InstallDailyTeamLogButton` component, and wiring it into `app/page.tsx` and `AgentCard`

**Files:**
- Create: `components/install-daily-team-log-button.tsx`
- Modify: `app/page.tsx`
- Modify: `components/agent-card.tsx`

**Interfaces:**
- Consumes: `installDailyTeamLog` (Task 3); `dailyTeamLogInstalled`
  (Task 2).
- Produces: `InstallDailyTeamLogButton({ agentId, companyName }: {
  agentId: string; companyName: string })`, and `AgentCard`'s new
  `showInstallDailyTeamLogButton?: boolean` prop, which renders
  `<InstallDailyTeamLogButton agentId={agent.id} companyName={agent.name} />`
  when true. **This is a distinct prop and component from the existing
  `showDailyTeamLogButton` / `DailyTeamLogButton`**, which is `plh-ops`'s
  own "run the report now" trigger (v9) — do not confuse the two or
  reuse either name.

This task creates the component and wires it in together (Steps 1–4),
then one type-check covering all of it (Step 5), matching how v18's
Task 4 was structured after its own initial split turned out to leave a
non-type-checking intermediate state — don't split this task further.

No separate test file for the button component — this project has no
component-level unit tests for any prior slice's UI; Task 5 covers live
verification.

- [ ] **Step 1: Create the button component**

Create `components/install-daily-team-log-button.tsx`:

```tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { installDailyTeamLog } from "@/lib/install-daily-team-log"

export function InstallDailyTeamLogButton({ agentId, companyName }: { agentId: string; companyName: string }) {
  const router = useRouter()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function handleConfirm() {
    setConfirmOpen(false)
    setPending(true)
    setMessage(null)
    const result = await installDailyTeamLog(agentId)
    setPending(false)
    if (result.ok) {
      router.refresh()
    } else {
      setMessage(result.message)
    }
  }

  return (
    <div className="space-y-1">
      <Button size="sm" variant="outline" onClick={() => setConfirmOpen(true)} disabled={pending}>
        {pending ? "Installing…" : "Install daily-team-log"}
      </Button>
      {message && <p className="text-xs text-destructive">{message}</p>}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Install daily-team-log?</AlertDialogTitle>
            <AlertDialogDescription>
              Adds a daily-report skill to &quot;{companyName}&quot; — turns each day&apos;s Claude Code
              session history into a daily report, committed to this company&apos;s own repo. Setup (who
              you are, which projects to include, scheduling) happens afterward inside Claude Code, not
              here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>Install</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
```

- [ ] **Step 2: Read both files this task also modifies**

Read `app/page.tsx` and `components/agent-card.tsx` in full. Confirm
`app/page.tsx` still computes cards inside `await Promise.all(results.map(async
(result) => { ... }))` (the v19 shape, ending with `integrationStatus`),
and `components/agent-card.tsx` still has the exact prop list and
`integrationStatus` rendering line shown below. If either has drifted,
stop and reconcile before editing.

- [ ] **Step 3: Modify `app/page.tsx`**

Change the import block from:

```tsx
import { companyOntologyExists } from "@/lib/company-ontology-exists"
import { getIntegrationStatus } from "@/lib/get-integration-status"
```

to:

```tsx
import { companyOntologyExists } from "@/lib/company-ontology-exists"
import { getIntegrationStatus } from "@/lib/get-integration-status"
import { dailyTeamLogInstalled } from "@/lib/daily-team-log-installed"
```

Change the card-building block from:

```tsx
            const needsCompanySetup =
              result.agent.kind === "command-set" && !(await companyOntologyExists(result.agent.rootPath))
            const integrationStatus = await getIntegrationStatus(result.agent)
            return (
              <AgentCard
                key={result.agent.id}
                agent={result.agent}
                latestActivity={latest}
                error={result.error}
                launchdHealth={isTakeshiAgent ? launchdHealth : undefined}
                pollStatus={isTakeshiAgent ? pollStatus : undefined}
                showVerifyButton={isAiCompanyStarterMain}
                showDailyTeamLogButton={isPlhOps}
                removable={isRegisteredCompany}
                avatarUrl={avatarByAgentId[result.agent.id] ?? null}
                showSetupCompanyButton={needsCompanySetup}
                integrationStatus={integrationStatus}
              />
            )
```

to:

```tsx
            const needsCompanySetup =
              result.agent.kind === "command-set" && !(await companyOntologyExists(result.agent.rootPath))
            const integrationStatus = await getIntegrationStatus(result.agent)
            const showInstallDailyTeamLogButton =
              result.agent.kind === "command-set" && !(await dailyTeamLogInstalled(result.agent.rootPath))
            return (
              <AgentCard
                key={result.agent.id}
                agent={result.agent}
                latestActivity={latest}
                error={result.error}
                launchdHealth={isTakeshiAgent ? launchdHealth : undefined}
                pollStatus={isTakeshiAgent ? pollStatus : undefined}
                showVerifyButton={isAiCompanyStarterMain}
                showDailyTeamLogButton={isPlhOps}
                removable={isRegisteredCompany}
                avatarUrl={avatarByAgentId[result.agent.id] ?? null}
                showSetupCompanyButton={needsCompanySetup}
                integrationStatus={integrationStatus}
                showInstallDailyTeamLogButton={showInstallDailyTeamLogButton}
              />
            )
```

- [ ] **Step 4: Modify `components/agent-card.tsx`**

Add one import, alongside the existing component imports:

```tsx
import { InstallDailyTeamLogButton } from "@/components/install-daily-team-log-button"
```

Change the props type from:

```tsx
type AgentCardProps = {
  agent: Agent
  latestActivity: Activity | null
  error: string | null
  launchdHealth?: LaunchdHealth
  pollStatus?: PollLockStatus
  showVerifyButton?: boolean
  showDailyTeamLogButton?: boolean
  removable?: boolean
  avatarUrl?: string | null
  showSetupCompanyButton?: boolean
  integrationStatus: string
}
```

to:

```tsx
type AgentCardProps = {
  agent: Agent
  latestActivity: Activity | null
  error: string | null
  launchdHealth?: LaunchdHealth
  pollStatus?: PollLockStatus
  showVerifyButton?: boolean
  showDailyTeamLogButton?: boolean
  removable?: boolean
  avatarUrl?: string | null
  showSetupCompanyButton?: boolean
  integrationStatus: string
  showInstallDailyTeamLogButton?: boolean
}
```

Change the function signature from:

```tsx
export function AgentCard({
  agent,
  latestActivity,
  error,
  launchdHealth,
  pollStatus,
  showVerifyButton,
  showDailyTeamLogButton,
  removable,
  avatarUrl,
  showSetupCompanyButton,
  integrationStatus,
}: AgentCardProps) {
```

to:

```tsx
export function AgentCard({
  agent,
  latestActivity,
  error,
  launchdHealth,
  pollStatus,
  showVerifyButton,
  showDailyTeamLogButton,
  removable,
  avatarUrl,
  showSetupCompanyButton,
  integrationStatus,
  showInstallDailyTeamLogButton,
}: AgentCardProps) {
```

Change the action block from:

```tsx
        <div className="space-y-2 pt-1">
          {pollStatus && <TriggerPollButton pollStatus={pollStatus} />}
          {showVerifyButton && <VerifyButton />}
          {showDailyTeamLogButton && <DailyTeamLogButton />}
          {showSetupCompanyButton && <CompanySetupWizard agentId={agent.id} companyName={agent.name} />}
          {removable && <RemoveCompanyButton id={agent.id} name={agent.name} />}
          <AgentAvatarForm agentId={agent.id} currentUrl={avatarUrl ?? null} />
        </div>
```

to:

```tsx
        <div className="space-y-2 pt-1">
          {pollStatus && <TriggerPollButton pollStatus={pollStatus} />}
          {showVerifyButton && <VerifyButton />}
          {showDailyTeamLogButton && <DailyTeamLogButton />}
          {showSetupCompanyButton && <CompanySetupWizard agentId={agent.id} companyName={agent.name} />}
          {showInstallDailyTeamLogButton && (
            <InstallDailyTeamLogButton agentId={agent.id} companyName={agent.name} />
          )}
          {removable && <RemoveCompanyButton id={agent.id} name={agent.name} />}
          <AgentAvatarForm agentId={agent.id} currentUrl={avatarUrl ?? null} />
        </div>
```

- [ ] **Step 5: Type-check and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors

Run: `npx vitest run`
Expected: all 233 tests still pass (this task adds no new tests)

- [ ] **Step 6: Commit**

```bash
git add components/install-daily-team-log-button.tsx app/page.tsx components/agent-card.tsx
git commit -m "feat: add Install daily-team-log button and wire it into AgentCard"
```

---

### Task 5: README and final verification

**Files:**
- Modify: `README.md` (append a new section after the most recent
  existing entry)

- [ ] **Step 1: Read the current README's most recent section**

Read the end of `README.md` to find the most recently appended section
(the v19 entry, if this plan runs right after v19) and match its heading
style (`## vNN: <short title>`).

- [ ] **Step 2: Append the v20 section**

Add, after the last existing section:

```markdown
## v20: install the daily-team-log workflow

The roadmap named v20 "guided command/workflow discovery, possibly
formalizing the plugin concept." Investigating what's real found that
command/workflow discovery has been fully solved since v11 (the Skills
page already scans any registered company's `.claude/skills/` and
`.claude/commands/`) — nothing needed there. "Formalize the plugin
concept" as a general, reusable packaging format has no existing
mechanism to build on anywhere in this ecosystem — every real workflow
(`plh-takeshi-agent`'s 6-role email pipeline, `plh-ops`'s
`skill-installer`) is bespoke to its own repo. Designing a real
plugin-packaging format from scratch would be a bigger effort than
v17-v19 combined, for a population of examples this project deliberately
keeps at one.

So v20 hand-builds a one-off installer for exactly one workflow instead:
`plh-ops`'s `daily-team-log` skill, chosen because it's the one workflow
in this whole ecosystem that was already designed to be portable — its
own `config.example.json` and self-bootstrapping `Setup.md` already
auto-detect who's using it and which projects to include, entirely
locally (no OAuth, no external API). Its extractor script, `gather.py`,
is copied verbatim (confirmed zero PLH/Takeshi-specific content); its
`SKILL.md` and `Setup.md` are regenerated rather than copied, since the
originals hardcode cloning `takeman555/plh-ops` and writing into
`reports/{Eito,Lucce,Nana}` — copying them as-is would have pointed a
new company's daily reports at PLH's shared repo instead of its own. The
"Install daily-team-log" button appears on any `command-set`-kind
agent's card that doesn't have it yet; the actual bootstrap (who you
are, which projects, scheduling) still happens inside Claude Code
afterward, the same division of labor v19 established for `api-connect`.

**Known, disclosed limitation:** `gather.py`'s config lives at a fixed,
global, per-machine path (`~/.claude/daily-team-log/config.json`), not
scoped per-installation — documented in the installed `SKILL.md` itself.
Only one company's `daily-team-log` can be actively bootstrapped per
machine at a time in this version; fixing that would mean redesigning
`gather.py`'s config storage, exactly the "generalize the format" work
this slice deliberately didn't do.

This is piece 4 of the roadmap.
```

- [ ] **Step 3: Full verification**

Run: `npx tsc --noEmit` — expect no errors
Run: `npx vitest run` — expect all 233 tests passing
Run: `npm run build` — expect a clean production build

- [ ] **Step 4: Live visual + functional verification**

Start a dev server on an unused port. Using Playwright (or equivalent):

1. Create a disposable company under `/tmp` via the existing "Add a
   company" → create-from-template flow (same as v17/v18/v19's live
   checks). Confirm its card shows an "Install daily-team-log" button.
2. Click it, confirm the dialog, confirm the button shows "Installing…"
   then the dialog closes and the button disappears (re-fetch confirms
   `dailyTeamLogInstalled` now returns true).
3. On disk, confirm `.claude/skills/daily-team-log/` has exactly 4 files
   (`gather.py`, `config.example.json`, `SKILL.md`, `Setup.md`);
   `gather.py` byte-for-byte matches the real
   `plh-ops/workflow/daily-team-log/gather.py`; `SKILL.md` contains
   `business: <the test company's name>` and no "PLH"/"Takeshi";
   `Setup.md` contains no "takeman555"/"plh-ops"/"Eito"/"Lucce"/"Nana".
4. Confirm `git -C <target> log --oneline` shows exactly one new commit
   ("Install daily-team-log via AI-Native control panel") on top of the
   create-from-template commit.
5. Confirm the real `plh-ops` directory is unmodified (`git -C
   ~/AI-Native/plh-ops status --short` — must be empty; this is a
   read-only source, never write to it).
6. Remove the disposable company via the existing "Remove" button, then
   delete the `/tmp` directory.
7. Take one screenshot of the install confirmation dialog for the
   record.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: document v20 daily-team-log installer in README"
```
