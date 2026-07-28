# v22: check-inbox command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Session note:** this session's subagent-spawn cap (200/session) has
> been hit on every prior slice (v14, v16–v21). If a task's implementer
> dispatch fails with a spawn-limit error, do not retry — execute that
> task (and the rest) directly: read the target file first, apply the
> step's code exactly, run the listed tests, self-review the whole
> branch before merging.

**Goal:** Add `check-inbox` — a generic, read-only Gmail command using
the already-installed `gog` CLI — so any `command-set` company can, once
it connects its own Google account via the existing `api-connect` skill,
run a summarized unread-mail check from the dashboard.

**Architecture:** A new zero-field `check-inbox` entry in the shared
command registry, whose spawned headless `claude -p` session is granted
narrowly-scoped `Bash(gog ...)` access via a new optional
`bashPatterns` field on `CompanyCommand` (all 5 existing commands omit
it and keep their current `--disallowedTools "Bash"` behavior
unchanged). The Skills-page "Run" tab, gated to `ai-company-starter-main`
only since v21, is relaxed to any `command-set` company. The command's
`.claude/commands/check-inbox.md` file is added to the
`ai-company-starter-main` template so new companies inherit it via v17's
existing whole-folder copy.

**Tech Stack:** `gog` (gogcli, already installed at
`/opt/homebrew/bin/gog`), the existing `node:child_process` spawn path,
Vitest. No new dependencies.

## Global Constraints

- `check-inbox` is **strictly read-only** — its `bashPatterns` are
  exactly `["gog -a auto gmail search*", "gog -a auto gmail get*"]` and
  nothing else. It must never be able to run `gog gmail send`,
  `gog gmail messages modify`, or any other command.
- The 5 existing commands (`digest`/`decision`/`retro`/`handoff`/
  `define-company`) must keep spawning with byte-identical args:
  `--allowedTools "Read,Grep,Glob,Edit(<path>)"` **and**
  `--disallowedTools "Bash"`. They omit the new `bashPatterns` field
  entirely (regression-proof).
- The disclosed, unfixed limitation: `gog`'s auth store is global
  per-machine and `check-inbox` uses `-a auto`, so only one company can
  meaningfully have its own connected Google account active at a time.
- **Task 4 commits to the `ai-company-starter-main` repo** (a separate
  local repo from control-panel, no remote) — a deliberate, spec-mandated
  addition of a new template command file, NOT a live-test write. This is
  distinct from the standing safety rule's never-write targets
  (`plh-takeshi-agent`, `plh-ops`), which this slice never touches.
- Live verification is unit-tests-only for the real spawn (same
  precedent as v9/v21): confirm the Run tab appears and the run reports
  "Started," then stop — never wait for a real `gog`-backed run to
  complete.

---

### Task 1: Register `check-inbox` and add the `bashPatterns` field

**Files:**
- Modify: `lib/company-commands/types.ts`
- Modify: `lib/company-commands/registry.ts`
- Modify: `lib/company-commands/registry.test.ts`

**Interfaces:**
- Produces: `CompanyCommand` gains an optional `bashPatterns?: string[]`
  field (Task 2's `runCompanyCommandImpl` reads it). A new registry
  entry `check-inbox` (id `"check-inbox"`, `commandFileName`
  `"check-inbox.md"`, zero fields, `outputKind: "new-file-in-dir"`,
  `outputPath: "notes/company/email-checks"`, `needsPrefetch: false`,
  `bashPatterns: ["gog -a auto gmail search*", "gog -a auto gmail get*"]`).

- [ ] **Step 1: Update the registry test to the new expected state**

Replace the first three `it(...)` blocks of
`lib/company-commands/registry.test.ts` (the `import` and closing lines
stay). Replace the whole file body from `describe(` through its closing
`})` with:

```ts
import { describe, it, expect } from "vitest"
import { COMPANY_COMMANDS, getCompanyCommand } from "./registry"

describe("COMPANY_COMMANDS registry", () => {
  it("has exactly the 6 in-scope commands", () => {
    expect(COMPANY_COMMANDS.map((c) => c.id).sort()).toEqual(
      ["check-inbox", "decision", "define-company", "digest", "handoff", "retro"].sort()
    )
  })

  it("every command's required fields are all present in its own buildPrompt output", () => {
    for (const command of COMPANY_COMMANDS) {
      const values: Record<string, string> = {}
      for (const field of command.fields) {
        values[field.key] = field.required ? `TEST_VALUE_${field.key}` : ""
      }
      const prompt = command.buildPrompt(values, "2026-07-23", "TEST_PREFETCH")
      for (const field of command.fields.filter((f) => f.required)) {
        expect(prompt).toContain(`TEST_VALUE_${field.key}`)
      }
    }
  })

  it("only handoff declares needsPrefetch", () => {
    const withPrefetch = COMPANY_COMMANDS.filter((c) => c.needsPrefetch).map((c) => c.id)
    expect(withPrefetch).toEqual(["handoff"])
  })

  it("only check-inbox declares bashPatterns, and exactly the two read-only gog commands", () => {
    const withBash = COMPANY_COMMANDS.filter((c) => c.bashPatterns && c.bashPatterns.length > 0).map((c) => c.id)
    expect(withBash).toEqual(["check-inbox"])
    expect(getCompanyCommand("check-inbox")?.bashPatterns).toEqual([
      "gog -a auto gmail search*",
      "gog -a auto gmail get*",
    ])
  })

  it("check-inbox is a zero-field new-file-in-dir command writing to notes/company/email-checks", () => {
    const cmd = getCompanyCommand("check-inbox")
    expect(cmd?.fields).toEqual([])
    expect(cmd?.outputKind).toBe("new-file-in-dir")
    expect(cmd?.outputPath).toBe("notes/company/email-checks")
    expect(cmd?.needsPrefetch).toBe(false)
  })

  it("check-inbox's buildPrompt is read-only: it names the two gog reads and forbids send/modify", () => {
    const prompt = getCompanyCommand("check-inbox")!.buildPrompt({}, "2026-07-28", "")
    expect(prompt).toContain("gog -a auto gmail search")
    expect(prompt).toContain("gog -a auto gmail get")
    expect(prompt).toMatch(/never send|do not run gog gmail send/i)
    expect(prompt).not.toContain("gmail messages modify")
  })

  it("getCompanyCommand returns undefined for an unknown id", () => {
    expect(getCompanyCommand("create-epic")).toBeUndefined()
    expect(getCompanyCommand("nonexistent")).toBeUndefined()
  })

  it("getCompanyCommand returns the matching entry for a known id", () => {
    expect(getCompanyCommand("digest")?.outputPath).toBe("notes/company/digests")
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/company-commands/registry.test.ts`
Expected: FAIL — the registry has 5 commands, no `check-inbox`, and
`CompanyCommand` has no `bashPatterns` field yet.

- [ ] **Step 3: Add `bashPatterns` to the `CompanyCommand` type**

In `lib/company-commands/types.ts`, change:

```ts
export type CompanyCommand = {
  id: string
  commandFileName: string
  label: string
  fields: CompanyCommandField[]
  outputKind: CompanyCommandOutputKind
  outputPath: string
  needsPrefetch: boolean
  buildPrompt: (fieldValues: Record<string, string>, today: string, prefetch: string) => string
}
```

to:

```ts
export type CompanyCommand = {
  id: string
  commandFileName: string
  label: string
  fields: CompanyCommandField[]
  outputKind: CompanyCommandOutputKind
  outputPath: string
  needsPrefetch: boolean
  bashPatterns?: string[]
  buildPrompt: (fieldValues: Record<string, string>, today: string, prefetch: string) => string
}
```

- [ ] **Step 4: Register the `check-inbox` command**

In `lib/company-commands/registry.ts`, find the closing `]` of the
`COMPANY_COMMANDS` array (the line `]` immediately before
`export function getCompanyCommand`). Insert this entry as the last
element of the array — i.e. after the final existing command object's
closing `},` and before the array's closing `]`:

```ts
  {
    id: "check-inbox",
    commandFileName: "check-inbox.md",
    label: "Check inbox",
    fields: [],
    outputKind: "new-file-in-dir",
    outputPath: "notes/company/email-checks",
    needsPrefetch: false,
    bashPatterns: ["gog -a auto gmail search*", "gog -a auto gmail get*"],
    buildPrompt: (fields, today) => `Run this repository's /check-inbox command as described in .claude/commands/check-inbox.md.

This is a READ-ONLY inbox check via the gog CLI (an authenticated Google account). Never send, mark-as-read, label, or archive anything.

1. List unread messages:
   gog -a auto gmail search "is:unread" --plain --max 20
   The first line is a header; each following line is tab-separated: ID, DATE, FROM, SUBJECT, LABELS, THREAD. If there are no result rows, write a report noting "no unread mail" and stop.

2. For each message ID, fetch metadata only (never the body):
   gog -a auto gmail get <ID> --format metadata --headers From,Subject,Date --plain

3. Write a summary to notes/company/email-checks/${today}-inbox-check.md (create notes/company/email-checks/ first if it doesn't exist) with this structure: frontmatter (type: inbox-check, status: active, created: ${today}, tags: []); a one-line banner that this is a read-only snapshot; a heading "# Inbox check ${today} (unread: <count>)"; a "## Unread" section listing "- <From> — <Subject> (<Date>)" per message; and a "## Notes / may need a reply" section with 1-2 lines on anything that looks like it needs attention (or "none").

Only ever run the two gog commands above (search and get). Do NOT run gog gmail send, gog gmail messages modify, or any other command. Do not copy message bodies, tokens, or personal data into the report — sender name, subject, and date only. Write exactly one file and stop.`,
  },
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run lib/company-commands/registry.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 6: Type-check and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors (the new `bashPatterns` field is optional; nothing
else references it yet)

Run: `npx vitest run`
Expected: all tests pass (247 existing + 3 net-new registry assertions)

- [ ] **Step 7: Commit**

```bash
git add lib/company-commands/types.ts lib/company-commands/registry.ts lib/company-commands/registry.test.ts
git commit -m "feat: register read-only check-inbox command with scoped gog bashPatterns"
```

---

### Task 2: Honor `bashPatterns` in the headless spawn

**Files:**
- Modify: `lib/company-commands/run-company-command-impl.ts`
- Modify: `lib/company-commands/run-company-command-impl.test.ts`

**Interfaces:**
- Consumes: `CompanyCommand.bashPatterns` (Task 1); the `check-inbox`
  registry entry (Task 1).
- Produces: no signature change to `runCompanyCommandImpl` — only its
  internal spawn-args construction changes. A command with
  `bashPatterns` spawns with
  `--allowedTools "Read,Grep,Glob,Edit(<scope>),Bash(<p1>),Bash(<p2>)"`
  and no `--disallowedTools` flag; a command without `bashPatterns`
  spawns exactly as before.

- [ ] **Step 1: Add the failing test**

In `lib/company-commands/run-company-command-impl.test.ts`, add this
test inside the `describe("runCompanyCommandImpl", () => { ... })`
block (immediately before its closing `})`):

```ts
  it("grants scoped Bash(gog ...) tools and omits --disallowedTools for a command declaring bashPatterns", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")

    const calls: { command: string; args: string[]; options: unknown }[] = []
    const result = await runCompanyCommandImpl(
      "check-inbox",
      {},
      "ai-company-starter-main",
      fakeSpawn(calls) as never,
      undefined,
      dataDir
    )

    expect(result).toEqual({ started: true, message: "Started" })
    expect(calls[0].args[calls[0].args.indexOf("--allowedTools") + 1]).toBe(
      "Read,Grep,Glob,Edit(notes/company/email-checks/**),Bash(gog -a auto gmail search*),Bash(gog -a auto gmail get*)"
    )
    expect(calls[0].args).not.toContain("--disallowedTools")
  })
```

The no-bashPatterns regression (a command WITHOUT patterns still gets
`--disallowedTools "Bash"` and an unchanged `--allowedTools`) is already
covered by the existing, unchanged digest and define-company spawn tests
in this same file — they assert `Edit(notes/company/digests/**)` /
`Edit(definitions/ontology/company.yaml)` plus `--disallowedTools
"Bash"` via `indexOf`, and must keep passing verbatim. Do not add a
duplicate regression test.

- [ ] **Step 2: Run the tests to verify the new one fails**

Run: `npx vitest run lib/company-commands/run-company-command-impl.test.ts`
Expected: FAIL on the new `check-inbox` test only — `runCompanyCommandImpl`
still always emits `--disallowedTools "Bash"` and never the `Bash(...)`
patterns. Every other test in the file still passes.

- [ ] **Step 3: Generalize the spawn-args construction**

In `lib/company-commands/run-company-command-impl.ts`, find this block
(inside the `try` in `runCompanyCommandImpl`):

```ts
    const editScopePattern =
      command.outputKind === "new-file-in-dir" ? `${command.outputPath}/**` : command.outputPath

    const logPath = path.join(dataDir, `${command.id}.log`)
    outFd = openSync(logPath, "a")
    const child = spawnFn(
      "claude",
      [
        "-p",
        prompt,
        "--allowedTools",
        `Read,Grep,Glob,Edit(${editScopePattern})`,
        "--disallowedTools",
        "Bash",
        "--permission-mode",
        "default",
        "--output-format",
        "text",
      ],
      { cwd: agent.rootPath, detached: true, stdio: ["ignore", outFd, outFd] }
    )
```

Replace it with:

```ts
    const editScopePattern =
      command.outputKind === "new-file-in-dir" ? `${command.outputPath}/**` : command.outputPath

    const bashPatterns = command.bashPatterns ?? []
    const allowedTools =
      bashPatterns.length > 0
        ? `Read,Grep,Glob,Edit(${editScopePattern}),${bashPatterns.map((p) => `Bash(${p})`).join(",")}`
        : `Read,Grep,Glob,Edit(${editScopePattern})`
    const spawnArgs = [
      "-p",
      prompt,
      "--allowedTools",
      allowedTools,
      // Only commands that declare no bashPatterns get a blanket Bash
      // disallow. A command with scoped Bash(...) patterns must NOT also
      // pass --disallowedTools Bash, which would override the allow.
      ...(bashPatterns.length > 0 ? [] : ["--disallowedTools", "Bash"]),
      "--permission-mode",
      "default",
      "--output-format",
      "text",
    ]

    const logPath = path.join(dataDir, `${command.id}.log`)
    outFd = openSync(logPath, "a")
    const child = spawnFn("claude", spawnArgs, {
      cwd: agent.rootPath,
      detached: true,
      stdio: ["ignore", outFd, outFd],
    })
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/company-commands/run-company-command-impl.test.ts`
Expected: PASS (all existing tests plus the 1 new one). The existing
digest/define-company spawn tests still pass unchanged — they assert via
`indexOf`, and no-bashPatterns commands still emit the same flags.

- [ ] **Step 5: Type-check and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors

Run: `npx vitest run`
Expected: all tests pass

- [ ] **Step 6: Commit**

```bash
git add lib/company-commands/run-company-command-impl.ts lib/company-commands/run-company-command-impl.test.ts
git commit -m "feat: grant scoped Bash access to commands declaring bashPatterns"
```

---

### Task 3: Open the Skills-page Run tab to any command-set company

**Files:**
- Modify: `components/skill-browser.tsx`

**Interfaces:**
- Consumes: `SkillAgentResult.agent.kind` (existing); the `check-inbox`
  command (Task 1).
- Produces: the "Run" tab now appears for a selected command file on any
  `command-set` company (not only `ai-company-starter-main`), and
  `CompanyCommandRunner` runs against that company's own `agentId`.

No unit test — this project has no component-level unit tests for any
prior slice's UI; correctness here is covered by the final live
verification (Task 5).

- [ ] **Step 1: Read the file before editing**

Read `components/skill-browser.tsx` in full. Confirm the
`matchedCompanyCommand` computation still reads
`selected.agentId === "ai-company-starter-main"` and the render line
still passes `agentId="ai-company-starter-main"`. If either has drifted,
stop and reconcile before editing.

- [ ] **Step 2: Relax the `matchedCompanyCommand` gate to command-set kind**

Change:

```tsx
  const matchedCompanyCommand =
    selected && selected.agentId === "ai-company-starter-main"
      ? COMPANY_COMMANDS.find((c) => selected.path.endsWith(`/commands/${c.commandFileName}`))
      : undefined
```

to:

```tsx
  const selectedAgent = selected ? results.find((r) => r.agent.id === selected.agentId)?.agent : undefined
  const matchedCompanyCommand =
    selected && selectedAgent?.kind === "command-set"
      ? COMPANY_COMMANDS.find((c) => selected.path.endsWith(`/commands/${c.commandFileName}`))
      : undefined
```

- [ ] **Step 3: Run the command against the selected company, not a hardcoded id**

Change:

```tsx
            {view === "run" && matchedCompanyCommand && (
              <CompanyCommandRunner command={matchedCompanyCommand} agentId="ai-company-starter-main" />
            )}
```

to:

```tsx
            {view === "run" && matchedCompanyCommand && selected && (
              <CompanyCommandRunner command={matchedCompanyCommand} agentId={selected.agentId} />
            )}
```

- [ ] **Step 4: Type-check and run the full suite**

Run: `npx tsc --noEmit`
Expected: no errors

Run: `npx vitest run`
Expected: all tests still pass (this task adds no new tests)

- [ ] **Step 5: Commit**

```bash
git add components/skill-browser.tsx
git commit -m "feat: open Skills-page Run tab to any command-set company"
```

---

### Task 4: Add `check-inbox.md` to the ai-company-starter-main template

**Files:**
- Create: `~/AI-Native/ai-company-starter-main/.claude/commands/check-inbox.md`
  (in the `ai-company-starter-main` repo — NOT the control-panel branch)

**Interfaces:** none in the control-panel codebase. This file makes
`check-inbox` (a) discoverable in the Skills scan of any company that
has it, so the Run tab has a card to attach to, and (b) inherited by
every new company created via v17's whole-folder copy of
`.claude/commands`.

This task commits to the `ai-company-starter-main` local repo (no
remote). It is a deliberate, spec-mandated template addition, distinct
from the standing safety rule's never-write targets (`plh-takeshi-agent`,
`plh-ops`), which this slice never touches.

- [ ] **Step 1: Confirm the target repo is clean and the file doesn't exist**

```bash
git -C ~/AI-Native/ai-company-starter-main status --short
ls ~/AI-Native/ai-company-starter-main/.claude/commands/check-inbox.md 2>&1
```

Expected: `status --short` shows no unexpected staged/modified files
(pre-existing untracked files are fine); the `ls` reports the file does
not exist yet. If `check-inbox.md` already exists, stop and reconcile.

- [ ] **Step 2: Create the command file**

Write `~/AI-Native/ai-company-starter-main/.claude/commands/check-inbox.md`:

```markdown
---
name: check-inbox
description: 接続済みの Google アカウント（gog CLI）で未読メールを確認し、要約を notes/company/email-checks/ に生成する（読み取り専用 — 送信・既読化・ラベル変更・アーカイブはしない）
---

# /check-inbox

接続済みの Google アカウント経由で受信トレイの未読メールを確認し、要約レポートを生成する。
**読み取り専用**: メールの送信・既読化・ラベル変更・アーカイブは一切しない。

前提: `gog` CLI が認証済みであること（未接続なら `api-connect` スキルで Google アカウントを繋ぐ）。

## 進め方

1. 未読メールを取得する:

   ```
   gog -a auto gmail search "is:unread" --plain --max 20
   ```

   1行目はヘッダ、2行目以降が結果（タブ区切り: ID, DATE, FROM, SUBJECT, LABELS, THREAD）。
   結果行が無ければ「未読メールなし」と書いて終了する。

2. 各メッセージの詳細をメタデータのみ取得する（ID ごとに1回、本文は取得しない）:

   ```
   gog -a auto gmail get <ID> --format metadata --headers From,Subject,Date --plain
   ```

3. 今日の日付で `notes/company/email-checks/<YYYY-MM-DD>-inbox-check.md` に要約を Write する
   （`notes/company/email-checks/` が無ければ先に作成）:

   ```markdown
   ---
   type: inbox-check
   status: active
   created: <YYYY-MM-DD>
   tags: []
   ---

   > 本ファイルは受信トレイの読み取り専用スナップショットです。

   # Inbox check <YYYY-MM-DD>（未読 <件数> 件）

   ## 未読メール
   - <FROM> — <SUBJECT>（<DATE>）

   ## 気づき / 対応が要りそうなもの
   - <差出人・件名から返信や対応が要りそうなものがあれば 1-2 行。無ければ「なし」>
   ```

## 鉄則

- **読み取り専用。** `gog gmail send` / `gog gmail messages modify` は絶対に呼ばない。
- メール本文・トークン・個人情報を要約に転記しない（差出人名・件名・日付のみ）。
- 上記2つの gog コマンド（search と get）以外は実行しない。ファイルを1つ書いたら終了する。
```

- [ ] **Step 3: Commit to the ai-company-starter-main repo**

```bash
git -C ~/AI-Native/ai-company-starter-main add .claude/commands/check-inbox.md
git -C ~/AI-Native/ai-company-starter-main commit -m "feat: add read-only check-inbox command to the company template"
```

- [ ] **Step 4: Verify the commit landed and only that file changed**

```bash
git -C ~/AI-Native/ai-company-starter-main show --stat HEAD
```

Expected: one commit touching exactly
`.claude/commands/check-inbox.md`, nothing else.

---

### Task 5: README and final verification

**Files:**
- Modify: `README.md` (control-panel repo)

- [ ] **Step 1: Read the current README's most recent section**

Read the end of `README.md` to find the `## v21:` section and match its
heading style.

- [ ] **Step 2: Append the v22 section**

Add, after the v21 section:

```markdown
## v22: check-inbox — a real, generic integration-consuming command

After v21, one roadmap thread remained: a fresh company having a real
integration worth connecting. Investigating turned up two things prior
slices had missed. First, `harness-engineering` — named as "core"
alongside `ai-company-starter-main` since v17 but never examined — is a
clone of a third-party public repo (a methodology thesis on writing
agent-facing docs), not functional infrastructure; `ai-company-starter-main`
doesn't reference it. Second, and the real finding: `plh-takeshi-agent`'s
"email connection," long assumed bespoke, is actually a call into `gog`
(gogcli) — a real, already-installed, general-purpose Google API CLI
(Gmail, Calendar, Drive, and more) with its own OAuth account store. And
`api-connect` (already scaffolded into every company) is a fully generic
"connect anything" skill that already handles OAuth for exactly this kind
of tool.

So "connect an integration" was never the missing piece — it's already
solved and already generic. The actual gap was narrower: no command in
the template *does* anything with a connected integration. v22 adds
exactly one: `check-inbox`, a strictly read-only "summarize my unread
mail" command that runs `gog -a auto gmail search`/`get` and writes a
metadata-only summary to `notes/company/email-checks/`. It never sends,
labels, archives, or reads message bodies.

Two pieces of machinery made this fit the existing system. The headless
command-runner (v8, generalized in v21) spawned every command with
`--disallowedTools "Bash"`; `check-inbox` is the first that needs a real
CLI, so `CompanyCommand` gained an optional `bashPatterns` field — a
command that declares patterns gets narrowly-scoped `Bash(gog ...)`
access (exactly the two read-only gog calls, nothing else) instead of a
blanket disallow, reusing the same scoped-Bash approach v9's
`daily-team-log` trigger already used. The 5 existing commands omit the
field and spawn byte-identically to before. And the Skills-page "Run"
tab, gated to `ai-company-starter-main` only since v21, now opens to any
`command-set` company — a natural completion of v21's generalization,
running each command against the selected company's own repo. The
`check-inbox.md` command file was added to the `ai-company-starter-main`
template, so every new company inherits it through v17's existing
whole-folder copy.

**Known, disclosed limitation:** `gog`'s auth store is global
per-machine and `check-inbox` uses `-a auto`, so only one company can
meaningfully have its own connected Google account active for this
command at a time — the same shape as v20's `daily-team-log`
config-collision limitation, documented rather than fixed.

This is piece 6 of the roadmap.
```

- [ ] **Step 3: Full verification**

Run: `npx tsc --noEmit` — expect no errors
Run: `npx vitest run` — expect all tests passing
Run: `npm run build` — expect a clean production build

- [ ] **Step 4: Live UI verification (unit-tests-only for the real spawn, per the spec)**

Start a dev server on an unused port. Using Playwright (or equivalent):

1. Confirm `check-inbox.md` is in the `ai-company-starter-main` template
   (Task 4 done) so a freshly-created company will inherit it.
2. Create a disposable company under `/tmp` via the existing "Add a
   company" → create-from-template flow (same as v17–v21's live checks).
   Confirm on disk that the new company has
   `.claude/commands/check-inbox.md` (inherited via the whole-folder
   copy).
3. Go to the Skills page. Confirm the new company's skill list includes
   a `check-inbox` command card. Open it. Confirm a "Run" tab now
   appears (this is the v22 reachability change — before v22 the Run tab
   only showed for `ai-company-starter-main`).
4. Click "Run". Confirm the runner reports "Started". **Do not wait for
   the real `claude -p`/`gog` run to finish.** Immediately check for a
   spawned process (`ps aux | grep "claude -p"`) and, if present, kill
   it — per the spec and v21's lesson, automated verification never lets
   a real headless spawn run to completion. (The fresh `/tmp` company is
   likely untrusted by Claude Code and the spawn may error on the trust
   check anyway; either outcome is fine — the check here is that the Run
   tab appears and "Started" is reported.)
5. Confirm the real `plh-ops`/`plh-takeshi-agent` directories are
   untouched (`git status --short` on each — must match their baseline).
   Confirm `ai-company-starter-main` shows only the Task-4
   `check-inbox.md` addition and nothing else new.
6. Remove the disposable company via the "Remove" button, then delete
   the `/tmp` directory. Confirm no stray `claude` process remains
   attached to any real company directory (`ps aux | grep claude`).

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: document v22 check-inbox command in README"
```
