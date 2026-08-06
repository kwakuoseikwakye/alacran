# Terminal-Visible Company-Command Runs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every company an opt-in, per-company setting — set in the company-setup wizard, editable afterward — that makes every command for that company run in a visible macOS Terminal window with a pre-run gate (shows the exact prompt, waits for Enter) instead of headless, with an offer to continue interactively via `claude -c` once the constrained run finishes.

**Architecture:** A new small registry (`lib/visible-run-registry.ts`) stores the per-company boolean, mirroring the existing `lib/ai-executor-registry.ts` exactly. A new pure function (`lib/company-commands/build-visible-run-script.ts`) generates the wrapper script's text — verified against the real system bash (3.2.57, no `mapfile`) in this session, not assumed. `runCompanyCommandImpl` gains one branch: when visible mode applies, it writes the args/prompt/script files and spawns `open -a Terminal <script>` with **no** Node-side exit handler (the script's own `trap ... EXIT` owns the lock's lifetime instead) — everything before the spawn point (validation, prefetch, prompt-building, the tool allowlist) is untouched. The wizard gets one new field, prefilled and persisted through two thin server actions.

**Tech Stack:** Next.js 15 / React 19 / TypeScript, Vitest, Node's `child_process`/`fs`, real `/bin/bash` for one integration-style test.

## Global Constraints

- **DI for OS calls:** every function touching the filesystem or shelling out takes an injectable function with a real default — `resolveVisibleRun: ResolveVisibleRunFn`, `platform: NodeJS.Platform` (both new), matching the existing `resolveExecutor`/`execFn`/`spawnFn` pattern in `runCompanyCommandImpl`.
- **Zero-extra-parameter Server Actions:** `getVisibleRun(agentId)` and `setVisibleRun(agentId, runVisibly)` take only real domain parameters — injectable seams live only in `lib/visible-run-registry.ts`.
- **macOS-only, silently absent elsewhere:** the setting is only ever true in effect when `platform === "darwin"`. On any other platform the run falls back to headless regardless of the stored value.
- **The command's prompt, tool allowlist, and diff-then-commit gate are byte-identical between a visible run and a headless run.** This plan only changes where the process's stdio goes and whether a human sees a gate before it starts — nothing about what a command is allowed to do.
- **Nothing sender- or user-supplied is ever shell-interpolated.** The prompt and the built args array exist only as file content, read back by the script — never spliced as text into the generated script itself.
- **The generated wrapper script must work under bash 3.2** (macOS's actual `/bin/bash` — confirmed via direct invocation in this session; `mapfile` does not exist there). Use the `while IFS= read -r -d ""` loop verified in this session, never `mapfile`.
- Run `npx tsc --noEmit` and `npx vitest run` after every task; both must be clean before moving to the next task.

---

### Task 1: `lib/visible-run-registry.ts` — the per-company setting store

**Files:**
- Create: `lib/visible-run-registry.ts`
- Test: `lib/visible-run-registry.test.ts`

**Interfaces:**
- Consumes: `getEffectiveAgents()` from `lib/get-effective-agents.ts` (existing), `dataPath()` from `lib/data-dir.ts` (existing).
- Produces: `VisibleRunAssignment = { agentId: string; runVisibly: boolean }`,
  `getVisibleRunAssignments(registryPath?): Promise<VisibleRunAssignment[]>`,
  `getVisibleRunForAgent(agentId: string, registryPath?): Promise<boolean>`
  (defaults to `false` for an unassigned agent),
  `setVisibleRunImpl(agentId: string, runVisibly: boolean, registryPath?): Promise<{ ok: true } | { ok: false; message: string }>`
  — used by Task 2 (the server actions) and Task 5 (`runCompanyCommandImpl`'s default `resolveVisibleRun`).

This is a line-for-line mirror of `lib/ai-executor-registry.ts`, with `executorId: AiExecutorId` replaced by `runVisibly: boolean` and no "unknown value" validation branch (a boolean has no invalid values, unlike an executor id).

- [ ] **Step 1: Write the failing tests**

```ts
// lib/visible-run-registry.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

let dataDir: string
let registryPath: string

beforeEach(async () => {
  dataDir = await mkdtemp(path.join(tmpdir(), "visible-run-registry-data-"))
  registryPath = path.join(dataDir, "visible-runs.json")
  vi.doMock("./get-effective-agents", () => ({
    getEffectiveAgents: async () => [
      { id: "plh-takeshi-agent", name: "Takeshi Agent", rootPath: "/fake", kind: "pipeline" },
      { id: "ai-company-starter-main", name: "AI Company Starter", rootPath: "/fake", kind: "command-set" },
    ],
  }))
})

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true })
  vi.resetModules()
})

describe("visible-run-registry", () => {
  it("returns an empty list when the registry file doesn't exist", async () => {
    const { getVisibleRunAssignments } = await import("./visible-run-registry")
    expect(await getVisibleRunAssignments(registryPath)).toEqual([])
  })

  it("returns an empty list when the registry file is unparseable", async () => {
    await writeFile(registryPath, "{ not json")
    const { getVisibleRunAssignments } = await import("./visible-run-registry")
    expect(await getVisibleRunAssignments(registryPath)).toEqual([])
  })

  it("defaults an unassigned agent to false", async () => {
    const { getVisibleRunForAgent } = await import("./visible-run-registry")
    expect(await getVisibleRunForAgent("ai-company-starter-main", registryPath)).toBe(false)
  })

  it("sets a new assignment for a known agent", async () => {
    const { setVisibleRunImpl, getVisibleRunAssignments } = await import("./visible-run-registry")
    const result = await setVisibleRunImpl("ai-company-starter-main", true, registryPath)
    expect(result).toEqual({ ok: true })
    expect(await getVisibleRunAssignments(registryPath)).toEqual([
      { agentId: "ai-company-starter-main", runVisibly: true },
    ])
  })

  it("upserts — setting a second time for the same agent replaces the first", async () => {
    const { setVisibleRunImpl, getVisibleRunAssignments } = await import("./visible-run-registry")
    await setVisibleRunImpl("ai-company-starter-main", true, registryPath)
    await setVisibleRunImpl("ai-company-starter-main", false, registryPath)
    expect(await getVisibleRunAssignments(registryPath)).toEqual([
      { agentId: "ai-company-starter-main", runVisibly: false },
    ])
  })

  it("getVisibleRunForAgent reflects an assignment once set", async () => {
    const { setVisibleRunImpl, getVisibleRunForAgent } = await import("./visible-run-registry")
    await setVisibleRunImpl("ai-company-starter-main", true, registryPath)
    expect(await getVisibleRunForAgent("ai-company-starter-main", registryPath)).toBe(true)
  })

  it("rejects an unknown agentId", async () => {
    const { setVisibleRunImpl } = await import("./visible-run-registry")
    const result = await setVisibleRunImpl("not-a-real-agent", true, registryPath)
    expect(result).toEqual({ ok: false, message: "Unknown agent" })
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/visible-run-registry.test.ts`
Expected: FAIL — `./visible-run-registry` does not exist yet.

- [ ] **Step 3: Write the implementation**

```ts
// lib/visible-run-registry.ts
import { readFile, writeFile, mkdir } from "node:fs/promises"
import path from "node:path"
import { getEffectiveAgents } from "./get-effective-agents"
import { dataPath } from "./data-dir"

export type VisibleRunAssignment = { agentId: string; runVisibly: boolean }

const DEFAULT_REGISTRY_PATH = dataPath("visible-runs.json")

export async function getVisibleRunAssignments(
  registryPath: string = DEFAULT_REGISTRY_PATH
): Promise<VisibleRunAssignment[]> {
  let raw: string
  try {
    raw = await readFile(registryPath, "utf-8")
  } catch {
    return []
  }
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export async function getVisibleRunForAgent(
  agentId: string,
  registryPath: string = DEFAULT_REGISTRY_PATH
): Promise<boolean> {
  const assignments = await getVisibleRunAssignments(registryPath)
  const entry = assignments.find((a) => a.agentId === agentId)
  return entry?.runVisibly ?? false
}

export async function setVisibleRunImpl(
  agentId: string,
  runVisibly: boolean,
  registryPath: string = DEFAULT_REGISTRY_PATH
): Promise<{ ok: true } | { ok: false; message: string }> {
  const agents = await getEffectiveAgents()
  if (!agents.some((a) => a.id === agentId)) {
    return { ok: false, message: "Unknown agent" }
  }

  const assignments = await getVisibleRunAssignments(registryPath)
  const withoutExisting = assignments.filter((a) => a.agentId !== agentId)
  await mkdir(path.dirname(registryPath), { recursive: true })
  await writeFile(
    registryPath,
    JSON.stringify([...withoutExisting, { agentId, runVisibly }], null, 2),
    "utf-8"
  )
  return { ok: true }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/visible-run-registry.test.ts`
Expected: PASS, all 7 tests.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add lib/visible-run-registry.ts lib/visible-run-registry.test.ts
git commit -m "Add visible-run-registry: per-company terminal-visibility setting"
```

---

### Task 2: `getVisibleRun`/`setVisibleRun` server actions

**Files:**
- Create: `lib/get-visible-run.ts`
- Create: `lib/set-visible-run.ts`

**Interfaces:**
- Consumes: `getVisibleRunForAgent`, `setVisibleRunImpl` from Task 1.
- Produces: `getVisibleRun(agentId: string): Promise<boolean>`,
  `setVisibleRun(agentId: string, runVisibly: boolean): Promise<{ ok: true } | { ok: false; message: string }>`
  — used by Task 7 (wizard wiring).

No dedicated test file — every existing thin server-action wrapper in this codebase (`lib/set-ai-executor.ts`, `lib/get-company-ontology.ts`) is untested; its logic is tested one layer down, which Task 1 already did.

- [ ] **Step 1: Write the implementation**

```ts
// lib/get-visible-run.ts
"use server"

import { getVisibleRunForAgent } from "./visible-run-registry"

export async function getVisibleRun(agentId: string): Promise<boolean> {
  return getVisibleRunForAgent(agentId)
}
```

```ts
// lib/set-visible-run.ts
"use server"

import { setVisibleRunImpl } from "./visible-run-registry"

export async function setVisibleRun(
  agentId: string,
  runVisibly: boolean
): Promise<{ ok: true } | { ok: false; message: string }> {
  return setVisibleRunImpl(agentId, runVisibly)
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Run the full test suite to confirm nothing broke**

Run: `npx vitest run`
Expected: all existing tests plus Task 1's new tests still PASS.

- [ ] **Step 4: Commit**

```bash
git add lib/get-visible-run.ts lib/set-visible-run.ts
git commit -m "Add getVisibleRun/setVisibleRun server actions"
```

---

### Task 3: `build-visible-run-script` — the wrapper script generator

**Files:**
- Create: `lib/company-commands/build-visible-run-script.ts`
- Test: `lib/company-commands/build-visible-run-script.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks — pure, standalone.
- Produces: `shQuote(value: string): string`,
  `BuildVisibleRunScriptInput = { binaryName: string; argsFilePath: string; promptFilePath: string; logPath: string; lockPath: string; cwd: string }`,
  `buildVisibleRunScript(input: BuildVisibleRunScriptInput): string`
  — used by Task 5 (`runCompanyCommandImpl`'s visible-run branch).

**On JS string-escaping in this task:** write every bash line that contains no JS-variable interpolation as a **plain single-quoted JS string**, never a template literal — this sidesteps any collision between bash's `${ARGS[@]}`/`\n`/`\0` syntax and JS template-literal interpolation entirely. Only the six `BINARY=`/`ARGSFILE=`/etc. assignment lines, which embed a real JS expression (`shQuote(...)`), use template literals. This exact convention is deliberate — see the code below.

- [ ] **Step 1: Write the failing tests**

```ts
// lib/company-commands/build-visible-run-script.test.ts
import { describe, it, expect } from "vitest"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { mkdtemp, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { shQuote, buildVisibleRunScript } from "./build-visible-run-script"

const execFileAsync = promisify(execFile)

describe("shQuote", () => {
  it("wraps a plain string in single quotes", () => {
    expect(shQuote("/tmp/foo/bar")).toBe("'/tmp/foo/bar'")
  })

  it("escapes an embedded single quote", () => {
    expect(shQuote("/tmp/o'malley/lock")).toBe("'/tmp/o'\\''malley/lock'")
  })
})

describe("buildVisibleRunScript", () => {
  const input = {
    binaryName: "claude",
    argsFilePath: "/data/cmd.args",
    promptFilePath: "/data/cmd.prompt",
    logPath: "/data/cmd.log",
    lockPath: "/data/company-command.lock",
    cwd: "/companies/acme",
  }

  it("owns the lock's lifetime via trap on EXIT", () => {
    const script = buildVisibleRunScript(input)
    expect(script).toContain('trap \'rm -f "$LOCKPATH"\' EXIT')
  })

  it("uses cat -v on the prompt file, never a plain cat or echo", () => {
    const script = buildVisibleRunScript(input)
    expect(script).toContain('cat -v "$PROMPTFILE"')
    expect(script).not.toMatch(/^cat "\$PROMPTFILE"/m)
    expect(script).not.toContain("echo \"$PROMPT\"")
  })

  it("tees output into the exact log path passed in", () => {
    const script = buildVisibleRunScript(input)
    expect(script).toContain('tee -a "$LOGPATH"')
    expect(script).toContain(`LOGPATH=${shQuote(input.logPath)}`)
  })

  it("reads the args file with a while/read -d loop, never mapfile", () => {
    const script = buildVisibleRunScript(input)
    expect(script).toContain('while IFS= read -r -d "" item; do')
    expect(script).not.toContain("mapfile")
  })

  it("offers claude -c to continue the conversation after the run finishes", () => {
    const script = buildVisibleRunScript(input)
    expect(script).toContain('exec "$BINARY" -c')
  })

  it("embeds every path via a quoted variable assignment, never inline in the trap or cd lines", () => {
    const script = buildVisibleRunScript(input)
    // Regression guard: this is the only thing that makes the trap line
    // safe. If a future edit splices a raw path into `trap '...'` directly,
    // this test must fail.
    const lines = script.split("\n")
    expect(lines).toContain(`CWD=${shQuote(input.cwd)}`)
    expect(lines).toContain('cd "$CWD"')
    expect(lines.filter((l) => l.startsWith("cd "))).toEqual(['cd "$CWD"'])
  })

  it("never contains prompt text or field values literally — this function only ever receives paths", () => {
    // There is no prompt-text parameter on BuildVisibleRunScriptInput at all,
    // so this is a structural guarantee, not a runtime check. This test
    // documents that: even a shell-metacharacter-laden cwd only ever lands
    // inside a single quoted assignment.
    const dangerous = { ...input, cwd: "/tmp/acme'; rm -rf ~; echo '" }
    const script = buildVisibleRunScript(dangerous)
    expect(script).toContain(`CWD=${shQuote(dangerous.cwd)}`)
    expect(script.split("\n").filter((l) => l.startsWith("cd "))).toEqual(['cd "$CWD"'])
  })

  it("the args-reading loop round-trips a NUL-delimited array under the real system bash, including an empty-string element", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "visible-run-args-"))
    try {
      const args = ["-p", "a prompt with spaces", "", "--flag"]
      const argsFile = path.join(dir, "cmd.args")
      await writeFile(argsFile, args.join("\0") + "\0")

      // Exercises the exact read-loop text buildVisibleRunScript emits,
      // without invoking a real claude/codex/aider binary. Printing with a
      // trailing newline (not NUL) keeps the assertion side simple; none of
      // this test's args contain a literal newline.
      const probeLines = [
        "#!/bin/bash",
        `ARGSFILE=${shQuote(argsFile)}`,
        "ARGS=()",
        'while IFS= read -r -d "" item; do',
        '  ARGS+=("$item")',
        'done < "$ARGSFILE"',
        'for a in "${ARGS[@]}"; do',
        '  printf "%s\\n" "$a"',
        "done",
      ]
      const scriptPath = path.join(dir, "probe.sh")
      await writeFile(scriptPath, probeLines.join("\n"), { mode: 0o755 })

      const { stdout } = await execFileAsync("/bin/bash", [scriptPath])
      const roundTripped = stdout.split("\n").slice(0, args.length)
      expect(roundTripped).toEqual(args)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/company-commands/build-visible-run-script.test.ts`
Expected: FAIL — `./build-visible-run-script` does not exist yet.

- [ ] **Step 3: Write the implementation**

```ts
// lib/company-commands/build-visible-run-script.ts

/**
 * Safely embed an arbitrary string as a single-quoted bash literal. Standard
 * technique: end the quote, insert an escaped literal quote, resume the
 * quote — so the result is safe to splice into generated script text
 * regardless of what characters the value contains.
 */
export function shQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`
}

export type BuildVisibleRunScriptInput = {
  binaryName: string
  argsFilePath: string
  promptFilePath: string
  logPath: string
  lockPath: string
  cwd: string
}

/**
 * Generates the wrapper script a visible run executes inside a real Terminal
 * window. Verified against macOS's actual /bin/bash (3.2.57 — no `mapfile`,
 * confirmed by direct invocation) rather than assumed portable.
 *
 * Every bash line below that needs no JS interpolation is written as a
 * plain single-quoted JS string, deliberately never a template literal —
 * this avoids any collision between bash's own `${...}` array-expansion
 * syntax and JS template-literal interpolation. Only the six `BINARY=` /
 * `ARGSFILE=` / etc. lines below, which embed a real JS expression
 * (`shQuote(...)`), use template literals.
 */
export function buildVisibleRunScript(input: BuildVisibleRunScriptInput): string {
  const { binaryName, argsFilePath, promptFilePath, logPath, lockPath, cwd } = input
  const lines = [
    "#!/bin/bash",
    `BINARY=${shQuote(binaryName)}`,
    `ARGSFILE=${shQuote(argsFilePath)}`,
    `PROMPTFILE=${shQuote(promptFilePath)}`,
    `LOGPATH=${shQuote(logPath)}`,
    `LOCKPATH=${shQuote(lockPath)}`,
    `CWD=${shQuote(cwd)}`,
    "",
    // Fires on the run finishing, an abort at the gate (Ctrl-C), or the
    // window simply being closed — a leaked lock wedges the company until
    // the app's stale-lock handling kicks in, so this must never be skipped.
    'trap \'rm -f "$LOCKPATH"\' EXIT',
    'cd "$CWD"',
    "",
    "ARGS=()",
    'while IFS= read -r -d "" item; do',
    '  ARGS+=("$item")',
    'done < "$ARGSFILE"',
    "",
    'echo "About to run: $BINARY (in $CWD)"',
    'echo "--- prompt ---"',
    // cat -v renders control characters visibly instead of letting the
    // terminal execute them — the gate's value depends on the user being
    // able to trust what they're reading before approving a run.
    'cat -v "$PROMPTFILE"',
    'echo "--- end prompt ---"',
    'read -p "Press Enter to run, or Ctrl-C to abort: "',
    "",
    '"$BINARY" "${ARGS[@]}" 2>&1 | tee -a "$LOGPATH"',
    'rm -f "$LOCKPATH"',
    'echo "Finished — review and commit the diff in Alacrán."',
    'read -p "Press Enter for an interactive session, or close this window: "',
    'exec "$BINARY" -c',
    "",
  ]
  return lines.join("\n")
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/company-commands/build-visible-run-script.test.ts`
Expected: PASS, all 9 tests. The real-bash round-trip test takes under a second — it never invokes `claude`/`codex`/`aider`, only `/bin/bash`.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add lib/company-commands/build-visible-run-script.ts lib/company-commands/build-visible-run-script.test.ts
git commit -m "Add buildVisibleRunScript, verified against real bash 3.2 (no mapfile)"
```

---

### Task 4: Pin `--permission-mode default` to the documented `"manual"` alias

**Files:**
- Modify: `lib/ai-executors.ts`
- Modify: `lib/ai-executors.test.ts`
- Modify: `lib/company-commands/run-company-command-impl.test.ts:127`

**Interfaces:** none — this is a self-contained value change, unrelated to every other task in this plan except that it touches a file Task 5 also touches. No new exports.

`--permission-mode default` is accepted by the real `claude` CLI (confirmed in this session: a genuinely invalid value errors, `default` doesn't) but is **not** among the documented choices (`acceptEdits`, `auto`, `bypassPermissions`, `manual`, `dontAsk`, `plan`) — it's a legacy alias for `manual`. Not broken today, but fragile: a future release could drop the alias with no warning until a run fails. This is scoped to `lib/ai-executors.ts` only — `lib/daily-team-log/trigger-daily-team-log-impl.ts:61` has the identical hardcoded string in a completely separate spawn path, but that's a different feature; leave it alone, it's out of scope for this task.

- [ ] **Step 1: Update the two assertions in `lib/ai-executors.test.ts`**

Change both occurrences of:
```ts
        "--permission-mode",
        "default",
```
to:
```ts
        "--permission-mode",
        "manual",
```
(one inside `"with no bashPatterns: adds --disallowedTools Bash"`, one inside `"with bashPatterns: omits --disallowedTools Bash and appends scoped Bash(...) entries"`).

- [ ] **Step 2: Update the one assertion in `lib/company-commands/run-company-command-impl.test.ts`**

Change line 127 from:
```ts
    expect(calls[0].args[calls[0].args.indexOf("--permission-mode") + 1]).toBe("default")
```
to:
```ts
    expect(calls[0].args[calls[0].args.indexOf("--permission-mode") + 1]).toBe("manual")
```

- [ ] **Step 3: Run the tests to verify they now fail against the old implementation**

Run: `npx vitest run lib/ai-executors.test.ts lib/company-commands/run-company-command-impl.test.ts`
Expected: FAIL — the assertions now expect `"manual"` but the implementation still produces `"default"`.

- [ ] **Step 4: Update the implementation**

In `lib/ai-executors.ts`, inside `"claude-code"`'s `buildArgs`, change:
```ts
        "--permission-mode",
        "default",
```
to:
```ts
        "--permission-mode",
        "manual",
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run lib/ai-executors.test.ts lib/company-commands/run-company-command-impl.test.ts`
Expected: PASS.

- [ ] **Step 6: Run the full suite**

Run: `npx vitest run`
Expected: all tests PASS (this confirms no other test asserted on the literal string `"default"` for this flag).

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
git add lib/ai-executors.ts lib/ai-executors.test.ts lib/company-commands/run-company-command-impl.test.ts
git commit -m "Pin --permission-mode to the documented 'manual' value, not the 'default' alias"
```

---

### Task 5: The visible-run branch in `runCompanyCommandImpl`

**Files:**
- Modify: `lib/company-commands/run-company-command-impl.ts`
- Modify: `lib/company-commands/run-company-command-impl.test.ts`

**Interfaces:**
- Consumes: `getVisibleRunForAgent` from Task 1, `buildVisibleRunScript` from Task 3.
- Produces: `runCompanyCommandImpl` gains two new trailing optional parameters,
  `resolveVisibleRun: ResolveVisibleRunFn = getVisibleRunForAgent` and
  `platform: NodeJS.Platform = process.platform`, and a new exported type
  `ResolveVisibleRunFn = (agentId: string) => Promise<boolean>` — not consumed
  by any later task, but useful for anyone writing a live/manual test.

- [ ] **Step 1: Write the failing tests**

Append to `lib/company-commands/run-company-command-impl.test.ts` (inside the existing `describe("runCompanyCommandImpl", ...)` block — read the file first to place these correctly relative to existing tests, which all live in that one `describe`):

```ts
  it("runs visibly (open -a Terminal, generated script, no exit handler) when the company has visible runs enabled on darwin", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")

    const calls: { command: string; args: string[]; options: unknown }[] = []
    const onCalls: string[] = []
    const spawnFn = (command: string, args: string[], options: unknown) => {
      calls.push({ command, args, options })
      return { unref: () => {}, on: (event: string) => { onCalls.push(event) } }
    }

    const result = await runCompanyCommandImpl(
      "digest",
      { period: "last week" },
      "ai-company-starter-main",
      spawnFn,
      undefined,
      dataDir,
      undefined,
      async () => true, // resolveVisibleRun
      "darwin"
    )

    expect(result).toEqual({ started: true, message: "Started" })
    expect(calls).toHaveLength(1)
    expect(calls[0].command).toBe("open")
    expect(calls[0].args[0]).toBe("-a")
    expect(calls[0].args[1]).toBe("Terminal")
    const scriptPath = calls[0].args[2]
    expect(scriptPath).toBe(path.join(dataDir, "digest.run.sh"))
    // The crux of the whole design: no exit handler in visible mode. The
    // script's own `trap ... EXIT` owns the lock's lifetime instead.
    expect(onCalls).toEqual([])
  })

  it("falls back to headless when visible runs is enabled but the platform is not darwin", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")

    const calls: { command: string; args: string[]; options: unknown }[] = []
    const onCalls: string[] = []
    const spawnFn = (command: string, args: string[], options: unknown) => {
      calls.push({ command, args, options })
      return { unref: () => {}, on: (event: string) => { onCalls.push(event) } }
    }

    await runCompanyCommandImpl(
      "digest",
      { period: "last week" },
      "ai-company-starter-main",
      spawnFn,
      undefined,
      dataDir,
      undefined,
      async () => true, // resolveVisibleRun — enabled, but platform isn't darwin
      "linux"
    )

    expect(calls).toHaveLength(1)
    expect(calls[0].command).toBe("claude")
    expect(onCalls).toEqual(["exit"])
  })

  it("writes the args file NUL-delimited and the prompt file verbatim for a visible run", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")

    const spawnFn = () => ({ unref: () => {}, on: () => {} })

    await runCompanyCommandImpl(
      "digest",
      { period: "last week" },
      "ai-company-starter-main",
      spawnFn,
      undefined,
      dataDir,
      undefined,
      async () => true,
      "darwin"
    )

    const argsRaw = await readFile(path.join(dataDir, "digest.args"), "utf-8")
    const args = argsRaw.split("\0").slice(0, -1) // drop trailing empty segment after final NUL
    expect(args[0]).toBe("-p")
    expect(args).toContain("--allowedTools")

    const promptRaw = await readFile(path.join(dataDir, "digest.prompt"), "utf-8")
    expect(promptRaw).toBe(args[1]) // the prompt is args[1] for claude-code's buildArgs shape
    expect(promptRaw.length).toBeGreaterThan(0)
  })

  it("makes the generated script executable", async () => {
    vi.doMock("../config", () => ({
      AGENTS: [{ id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }],
    }))
    const { runCompanyCommandImpl } = await import("./run-company-command-impl")

    const spawnFn = () => ({ unref: () => {}, on: () => {} })

    await runCompanyCommandImpl(
      "digest",
      { period: "last week" },
      "ai-company-starter-main",
      spawnFn,
      undefined,
      dataDir,
      undefined,
      async () => true,
      "darwin"
    )

    const scriptStat = await stat(path.join(dataDir, "digest.run.sh"))
    // eslint-disable-next-line no-bitwise
    expect(scriptStat.mode & 0o111).not.toBe(0) // at least one execute bit set
  })
```

Add `stat` to the existing `import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"` line at the top of the test file (it already imports several `node:fs/promises` functions — extend that same import rather than adding a second one).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/company-commands/run-company-command-impl.test.ts`
Expected: FAIL — `runCompanyCommandImpl` doesn't accept a `resolveVisibleRun`/`platform` parameter yet, and always spawns headless.

- [ ] **Step 3: Write the implementation**

Read the current `lib/company-commands/run-company-command-impl.ts` in full first (it's ~160 lines) — the edits below are precise but assume you're looking at the real file, not reconstructing it from memory.

**3a. Widen `SpawnOptions`'s `stdio` type** (near the top, where `SpawnOptions`/`SpawnedProcess`/`SpawnFn` are defined) from:
```ts
export type SpawnOptions = {
  cwd: string
  detached: boolean
  stdio: ["ignore", number, number]
}
```
to:
```ts
export type SpawnOptions = {
  cwd: string
  detached: boolean
  stdio: ["ignore", number | "ignore", number | "ignore"]
}
```
This is the only change needed to let the visible-run branch spawn `open` with `stdio: ["ignore", "ignore", "ignore"]` (its own output is irrelevant — the real output goes to the Terminal window) through the same `SpawnFn` type the headless branch already uses.

**3b. Add the new imports** alongside the existing ones at the top of the file:
```ts
import { getVisibleRunForAgent } from "../visible-run-registry"
import { buildVisibleRunScript } from "./build-visible-run-script"
```

**3c. Add the new type**, near `ResolveExecutorFn`:
```ts
export type ResolveVisibleRunFn = (agentId: string) => Promise<boolean>
```

**3d. Extend the function signature.** Change:
```ts
export async function runCompanyCommandImpl(
  commandId: string,
  fieldValues: Record<string, string>,
  agentId: string,
  spawnFn: SpawnFn = defaultSpawn,
  execFn: ExecFileFn = defaultExecFile,
  dataDir: string = path.join(COMPANY_COMMANDS_DATA_DIR, agentId),
  resolveExecutor: ResolveExecutorFn = resolveAiExecutorForAgent
): Promise<{ started: boolean; message: string }> {
```
to:
```ts
export async function runCompanyCommandImpl(
  commandId: string,
  fieldValues: Record<string, string>,
  agentId: string,
  spawnFn: SpawnFn = defaultSpawn,
  execFn: ExecFileFn = defaultExecFile,
  dataDir: string = path.join(COMPANY_COMMANDS_DATA_DIR, agentId),
  resolveExecutor: ResolveExecutorFn = resolveAiExecutorForAgent,
  resolveVisibleRun: ResolveVisibleRunFn = getVisibleRunForAgent,
  platform: NodeJS.Platform = process.platform
): Promise<{ started: boolean; message: string }> {
```

**3e. Replace the spawn block.** Find this existing code near the end of the function body (inside the `try` block, after `const spawnArgs = executor.buildArgs({ prompt, editScopePattern, bashPatterns })`):
```ts
    const logPath = path.join(dataDir, `${command.id}.log`)
    outFd = openSync(logPath, "a")
    const child = spawnFn(executor.binaryName, spawnArgs, {
      cwd: agent.rootPath,
      detached: true,
      stdio: ["ignore", outFd, outFd],
    })
    child.on("exit", () => {
      releaseRunLock(dataDir).catch(() => {})
    })
    child.unref()
    return { started: true, message: "Started" }
```
Replace it with:
```ts
    const logPath = path.join(dataDir, `${command.id}.log`)
    const runVisibly = platform === "darwin" && (await resolveVisibleRun(agentId))

    if (runVisibly) {
      const argsPath = path.join(dataDir, `${command.id}.args`)
      const promptPath = path.join(dataDir, `${command.id}.prompt`)
      const scriptPath = path.join(dataDir, `${command.id}.run.sh`)
      await writeFile(argsPath, spawnArgs.join("\0") + "\0", "utf-8")
      await writeFile(promptPath, prompt, "utf-8")
      const script = buildVisibleRunScript({
        binaryName: executor.binaryName,
        argsFilePath: argsPath,
        promptFilePath: promptPath,
        logPath,
        lockPath: path.join(dataDir, "company-command.lock"),
        cwd: agent.rootPath,
      })
      await writeFile(scriptPath, script, { mode: 0o755 })
      const child = spawnFn("open", ["-a", "Terminal", scriptPath], {
        cwd: agent.rootPath,
        detached: true,
        stdio: ["ignore", "ignore", "ignore"],
      })
      // Deliberately NOT attaching an "exit" handler here: `open` returns
      // the instant Terminal is told to open the window, long before the
      // script — let alone the run inside it — finishes. The wrapper
      // script's own `trap ... EXIT` releases the lock instead; attaching
      // this handler too would release it immediately and the app would
      // report "finished" while the gate is still waiting for Enter.
      child.unref()
      return { started: true, message: "Started" }
    }

    outFd = openSync(logPath, "a")
    const child = spawnFn(executor.binaryName, spawnArgs, {
      cwd: agent.rootPath,
      detached: true,
      stdio: ["ignore", outFd, outFd],
    })
    child.on("exit", () => {
      releaseRunLock(dataDir).catch(() => {})
    })
    child.unref()
    return { started: true, message: "Started" }
```

Both branches remain inside the function's existing outer `try { ... } catch (err) { await releaseRunLock(dataDir)... }` block, so a failure writing any of the three new files is already caught and handled exactly like any other spawn-path failure — no new error handling needed. The existing `finally { if (outFd !== undefined) closeSync(outFd) }` also needs no change: `outFd` stays `undefined` on the visible-run path (it's never assigned there), so nothing is closed that was never opened.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/company-commands/run-company-command-impl.test.ts`
Expected: PASS, including all pre-existing tests (they don't pass a `resolveVisibleRun`/`platform` argument, so they get the real defaults — `platform` defaults to the real `process.platform`, and `resolveVisibleRun` defaults to `getVisibleRunForAgent` reading a registry file that doesn't exist in the test environment, so it resolves to `false` — meaning every pre-existing test stays on the headless path unchanged).

- [ ] **Step 5: Run the full suite**

Run: `npx vitest run`
Expected: all tests PASS.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add lib/company-commands/run-company-command-impl.ts lib/company-commands/run-company-command-impl.test.ts
git commit -m "Add the visible-run branch to runCompanyCommandImpl"
```

---

### Task 6: `VisibleRunToggle` component

**Files:**
- Create: `components/visible-run-toggle.tsx`

**Interfaces:**
- Consumes: `getVisibleRun`, `setVisibleRun` from Task 2.
- Produces: `VisibleRunToggle({ agentId }: { agentId: string })` — used by Task 7.

Mirrors `components/ai-executor-picker.tsx`'s immediate-persist-on-change pattern (fetch current value on mount, call the setter immediately when the user changes it, roll back optimistically on failure), but as a checkbox instead of a `<select>`, and it fetches its own initial value on mount rather than receiving one as a prop — because, unlike `AiExecutorPicker` (which only ever appears on an already-rendered `AgentCard`, so the server page can compute its value up front), this component lives inside `CompanySetupWizard`'s Sheet, which is `"use client"` and only decides what to show once the user opens it.

- [ ] **Step 1: Write the component**

```tsx
// components/visible-run-toggle.tsx
"use client"

import { useEffect, useState } from "react"
import { getVisibleRun } from "@/lib/get-visible-run"
import { setVisibleRun } from "@/lib/set-visible-run"

export function VisibleRunToggle({ agentId }: { agentId: string }) {
  const [checked, setChecked] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getVisibleRun(agentId).then((value) => {
      if (cancelled) return
      setChecked(value)
      setLoaded(true)
    })
    return () => {
      cancelled = true
    }
  }, [agentId])

  async function handleChange(next: boolean) {
    const previous = checked
    setChecked(next)
    setPending(true)
    setMessage(null)
    const result = await setVisibleRun(agentId, next)
    setPending(false)
    if (!result.ok) {
      setChecked(previous)
      setMessage(result.message)
    }
  }

  if (!loaded) return null

  return (
    <div className="space-y-1">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={checked}
          disabled={pending}
          onChange={(e) => void handleChange(e.target.checked)}
        />
        Run commands in a visible Terminal window
      </label>
      <p className="text-xs text-muted-foreground">
        Every command opens a real Terminal window and shows you the exact prompt before running —
        press Enter to proceed, or Ctrl-C to abort. When it finishes, it offers an interactive session
        continuing that run, which is not limited to what the command itself is allowed to do. macOS
        only.
      </p>
      {message && <p className="text-xs text-destructive">{message}</p>}
    </div>
  )
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add components/visible-run-toggle.tsx
git commit -m "Add VisibleRunToggle component"
```

---

### Task 7: Wire the toggle into the company-setup wizard, gated to macOS

**Files:**
- Modify: `components/company-setup-wizard.tsx`
- Modify: `components/agent-card.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `VisibleRunToggle` from Task 6.
- Produces: `CompanySetupWizard` gains one new optional prop, `showVisibleRunOption?: boolean`; `AgentCard` gains the same new optional prop, threaded through to both of its `CompanySetupWizard` renders.

**7a. `app/page.tsx`** — compute the platform gate once, alongside the existing per-card computations. Add near the top of the `results.map(async (result, index) => { ... })` callback (find `const isCommandSet = result.agent.kind === "command-set"` and add the new line directly after it):

```ts
            const isCommandSet = result.agent.kind === "command-set"
            const showVisibleRunOption = isCommandSet && process.platform === "darwin"
```

Then add the new prop to the `<AgentCard ... />` call, alongside the existing `showOwnershipButton={isCommandSet}` line:

```tsx
                showOwnershipButton={isCommandSet}
                showVisibleRunOption={showVisibleRunOption}
```

**7b. `components/agent-card.tsx`** — read the current file first (it changed in a prior slice; the ownership-dashboard button was added recently). Add `showVisibleRunOption?: boolean` to `AgentCardProps`, alongside `showOwnershipButton?: boolean`. Destructure it in the function signature the same way. Pass it through to **both** existing `<CompanySetupWizard>` render sites:

```tsx
          {showSetupCompanyButton && (
            <CompanySetupWizard
              agentId={agent.id}
              companyName={agent.name}
              showVisibleRunOption={showVisibleRunOption}
            />
          )}
          {showEditCompanyButton && (
            <CompanySetupWizard
              agentId={agent.id}
              companyName={agent.name}
              mode="edit"
              showVisibleRunOption={showVisibleRunOption}
            />
          )}
```

(These replace the existing single-line versions of both — `agent-card.tsx` currently renders each as `{showSetupCompanyButton && <CompanySetupWizard agentId={agent.id} companyName={agent.name} />}` and `{showEditCompanyButton && (<CompanySetupWizard agentId={agent.id} companyName={agent.name} mode="edit" />)}` respectively; read the file to confirm exact current formatting before editing.)

**7c. `components/company-setup-wizard.tsx`** — add the prop and render the toggle in the `"review"` step, in **both** of its render branches (the plain summary view and the AI-draft view both currently sit inside `step === "review"`, but the toggle should show regardless of which one is active, since it's an independent setting, not part of either). Add to the props type:

```ts
export function CompanySetupWizard({
  agentId,
  companyName,
  mode = "create",
  showVisibleRunOption,
}: {
  agentId: string
  companyName: string
  /** "edit" prefills every field from the company's saved company.yaml on open. */
  mode?: "create" | "edit"
  showVisibleRunOption?: boolean
}) {
```

Add the import at the top:
```ts
import { VisibleRunToggle } from "@/components/visible-run-toggle"
```

Render it once, right after the `<SheetHeader>` block closes and before the `{loadingExisting && ...}` line, so it's visible on every step rather than only the review step — simpler than threading it into two separate conditional branches, and there's no reason a technical user shouldn't be able to set it as soon as the wizard opens rather than only at the end:

```tsx
          <div className="space-y-4 px-4 pb-4">
            {showVisibleRunOption && (
              <div className="border-b pb-3">
                <VisibleRunToggle agentId={agentId} />
              </div>
            )}
            {loadingExisting && <p className="text-sm text-muted-foreground">Loading saved details…</p>}
```

- [ ] **Step 1: Make the three edits above**

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Run the full test suite**

Run: `npx vitest run`
Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx components/agent-card.tsx components/company-setup-wizard.tsx
git commit -m "Wire VisibleRunToggle into the company-setup wizard, gated to macOS"
```

---

### Task 8: Full verification pass

**Files:** none created or modified — this task only runs checks.

- [ ] **Step 1: Full typecheck**

Run: `npx tsc --noEmit`
Expected: no errors (aside from the pre-existing, unrelated `components/alacran-mark.tsx` PNG-import error if `next-env.d.ts` hasn't been generated yet in this checkout — running `npm run build` once, per Step 3, generates it and resolves that specific error, as observed during the previous slice's verification).

- [ ] **Step 2: Full test suite**

Run: `npx vitest run`
Expected: all tests PASS.

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 4: Live verification against a disposable /tmp company**

Per the standing safety rule, use a freshly-created, self-destroyed `/tmp` company (sanctioned target #2) — never `plh-takeshi-agent` or `plh-ops`. Steps:

1. Create a disposable company directory under `/tmp` with a minimal `.claude/commands/digest.md`-equivalent setup (or register any existing throwaway `command-set` company already used for prior live tests).
2. In the running dev server, open that company's "Set up your company" (or "Edit company details") wizard and confirm the "Run commands in a visible Terminal window" checkbox appears (this is macOS, so it should) and toggling it persists (reload the page, reopen the wizard, confirm the checkbox reflects the last value).
3. Trigger a command run for that company from the Skills/Run tab.
4. Confirm a real Terminal window opens, shows "About to run: claude (in <path>)" followed by the prompt text, and is waiting at "Press Enter to run, or Ctrl-C to abort:".
5. **Stop here — press Ctrl-C to abort, do not press Enter.** Per the standing rule, automated/session verification must never wait on or trigger a real `claude -p` completion; a human-in-the-loop gate is exactly the kind of thing that must be left for the user to actually run through, not simulated by an agent pressing "Enter" on its own confirmation gate.
6. Confirm aborting released the lock: the app no longer shows the command as "running" for that company.
7. Delete the disposable `/tmp` company directory.

- [ ] **Step 5: Spot-check the CHANGELOG**

Confirm the current highest `vNN` in `CHANGELOG.md`, then append a dated entry for this slice (`## vNN (2026-08-06): terminal-visible company-command runs`) summarizing what shipped, following the style of the existing `v31`/`v32`/`v34` entries — including the bash-3.2/`mapfile` finding, since that's exactly the kind of "measured, not assumed" detail this project's changelog already records for similar discoveries (`launchctl` exit codes, `--add-dir` behavior). Also note, as a documented-not-fixed finding (matching the "Related investigation, not in scope" section already in this slice's design spec): `lib/daily-team-log/trigger-daily-team-log-impl.ts` has the same `--permission-mode default` string this slice pinned to `"manual"` in `lib/ai-executors.ts`, left untouched as out of scope.
