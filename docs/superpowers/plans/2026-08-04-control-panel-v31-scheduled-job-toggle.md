# v31 Scheduled-Runs Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the `plh-takeshi-agent` card an on/off control for its `com.plh.takeshi-agent` launchd job, so the recurring 5-minute poll can be stopped and restarted from the UI instead of a terminal.

**Architecture:** A new `lib/scheduled-job/` module shells `launchctl unload`/`load` against a hardcoded plist path — the same commands that agent repo's own `install.sh`/`uninstall.sh` use. The authoritative success test is the **resulting state** read back via the existing `checkLaunchdJob()`, never the command's exit code. The card's existing static `launchd: loaded (last exit 0)` line becomes an interactive control, gated on the agent being a present built-in AND the plist existing.

**Tech Stack:** Next.js 15 App Router, React 19, TypeScript, Tailwind v4, vitest, radix `AlertDialog`, macOS `launchctl`.

**Spec:** `docs/superpowers/specs/2026-08-04-control-panel-v31-scheduled-job-toggle-design.md`

## Global Constraints

- **Never write to, commit in, or mutate `~/AI-Native/plh-takeshi-agent` or `~/AI-Native/plh-ops`** for any test or verification purpose. This slice manipulates that agent's launchd *job state*, never its files — and even the job state is only touched by the user clicking the real button, never by automated verification.
- **Live-test `launchctl` only against a disposable job** — label `com.alacran.testjob`, program `/usr/bin/true`, created and deleted by the test. Never against `com.plh.takeshi-agent`.
- **Never edit `components/ui/*`** to fix a styling issue — fix the design token or the consumer's className.
- **Zero-extra-parameter Server Actions:** public `"use server"` functions take only real domain parameters. Every injectable seam (`execFileFn`, `checkFn`) lives only in the paired `-impl.ts`.
- **The launchd label and plist path are hardcoded module constants, never parameters.** The public Server Action is reachable by anything the browser can reach; accepting a caller-supplied label or path would let it unload arbitrary launchd jobs.
- **DI for OS calls:** every function that shells out takes an injectable `ExecFileFn` with a real default.
- `lib/adapters/launchd.ts` is **read and reused unchanged** — do not modify it.
- Dark-only palette; use existing tokens (`text-muted-foreground`, `text-destructive`, `text-success`). Add no new colours.
- Do not add any npm dependency.

---

### Task 1: Core toggle logic (`lib/scheduled-job/`)

**Files:**
- Create: `lib/scheduled-job/paths.ts`
- Create: `lib/scheduled-job/set-scheduled-job-impl.ts`
- Test: `lib/scheduled-job/set-scheduled-job-impl.test.ts`

**Interfaces:**
- Consumes: `checkLaunchdJob(label, exec?)` and type `LaunchdHealth` from `lib/adapters/launchd.ts` (unchanged); `TAKESHI_AGENT_LAUNCHD_LABEL` from `lib/config.ts` (value `"com.plh.takeshi-agent"`).
- Produces:
  - `TAKESHI_LAUNCHD_PLIST_PATH: string` (from `lib/scheduled-job/paths.ts`)
  - `type ExecFileFn = (command: string, args: string[]) => Promise<{ stdout: string; stderr: string }>`
  - `type SetScheduledJobResult = { ok: boolean; enabled: boolean; message: string }`
  - `setScheduledJobImpl(enabled: boolean, execFileFn?: ExecFileFn, checkFn?: CheckFn): Promise<SetScheduledJobResult>`
  - `type CheckFn = (label: string) => Promise<LaunchdHealth>`

- [ ] **Step 1: Create the paths module**

`lib/scheduled-job/paths.ts`:

```ts
import os from "node:os"
import path from "node:path"

/**
 * The Takeshi agent's LaunchAgent plist. Deliberately a hardcoded constant, not
 * a parameter: the public Server Action that unloads it is reachable by anything
 * the browser can reach, so a caller-supplied path would let it unload any
 * launchd job on the machine.
 */
export const TAKESHI_LAUNCHD_PLIST_PATH = path.join(
  os.homedir(),
  "Library",
  "LaunchAgents",
  "com.plh.takeshi-agent.plist"
)
```

- [ ] **Step 2: Write the failing tests**

`lib/scheduled-job/set-scheduled-job-impl.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { setScheduledJobImpl } from "./set-scheduled-job-impl"
import type { ExecFileFn, CheckFn } from "./set-scheduled-job-impl"
import { TAKESHI_LAUNCHD_PLIST_PATH } from "./paths"

const loaded: CheckFn = async () => ({ loaded: true, lastExitStatus: 0 })
const notLoaded: CheckFn = async () => ({ loaded: false, lastExitStatus: null })
const ok: ExecFileFn = async () => ({ stdout: "", stderr: "" })

describe("setScheduledJobImpl", () => {
  it("enables by running `launchctl load` against the hardcoded plist", async () => {
    const calls: Array<[string, string[]]> = []
    const execFn: ExecFileFn = async (command, args) => {
      calls.push([command, args])
      return { stdout: "", stderr: "" }
    }
    const result = await setScheduledJobImpl(true, execFn, loaded)
    expect(calls).toEqual([["launchctl", ["load", TAKESHI_LAUNCHD_PLIST_PATH]]])
    expect(result.ok).toBe(true)
    expect(result.enabled).toBe(true)
  })

  it("disables by running `launchctl unload` against the hardcoded plist", async () => {
    const calls: Array<[string, string[]]> = []
    const execFn: ExecFileFn = async (command, args) => {
      calls.push([command, args])
      return { stdout: "", stderr: "" }
    }
    const result = await setScheduledJobImpl(false, execFn, notLoaded)
    expect(calls).toEqual([["launchctl", ["unload", TAKESHI_LAUNCHD_PLIST_PATH]]])
    expect(result.ok).toBe(true)
    expect(result.enabled).toBe(false)
  })

  // The case exit-code-based logic gets wrong: `launchctl unload` on a plist
  // that is present but already unloaded exits non-zero, yet the job IS in the
  // requested state. Resulting state is the source of truth, not the exit code.
  it("reports success when the command fails but the job is already in the requested state", async () => {
    const execFn: ExecFileFn = async () => {
      throw new Error("Unload failed: 113: Could not find specified service")
    }
    const result = await setScheduledJobImpl(false, execFn, notLoaded)
    expect(result.ok).toBe(true)
    expect(result.enabled).toBe(false)
  })

  it("reports failure with the command's error when the state did not change", async () => {
    const execFn: ExecFileFn = async () => {
      throw new Error("Load failed: 5: Input/output error")
    }
    const result = await setScheduledJobImpl(false, execFn, loaded)
    expect(result.ok).toBe(false)
    expect(result.enabled).toBe(true)
    expect(result.message).toContain("Input/output error")
  })

  it("reports failure when the command succeeds but the state did not change", async () => {
    const result = await setScheduledJobImpl(false, ok, loaded)
    expect(result.ok).toBe(false)
    expect(result.enabled).toBe(true)
  })

  it("never passes a caller-supplied path — the plist argv token is the constant", async () => {
    const calls: string[][] = []
    const execFn: ExecFileFn = async (_command, args) => {
      calls.push(args)
      return { stdout: "", stderr: "" }
    }
    await setScheduledJobImpl(true, execFn, loaded)
    expect(calls[0][1]).toBe(TAKESHI_LAUNCHD_PLIST_PATH)
    expect(calls[0]).toHaveLength(2)
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run lib/scheduled-job/set-scheduled-job-impl.test.ts`
Expected: FAIL — cannot resolve `./set-scheduled-job-impl`.

- [ ] **Step 4: Write the implementation**

`lib/scheduled-job/set-scheduled-job-impl.ts`:

```ts
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { checkLaunchdJob } from "../adapters/launchd"
import type { LaunchdHealth } from "../adapters/launchd"
import { TAKESHI_AGENT_LAUNCHD_LABEL } from "../config"
import { TAKESHI_LAUNCHD_PLIST_PATH } from "./paths"

const execFileAsync = promisify(execFile)

export type ExecFileFn = (
  command: string,
  args: string[]
) => Promise<{ stdout: string; stderr: string }>

export type CheckFn = (label: string) => Promise<LaunchdHealth>

export type SetScheduledJobResult = {
  ok: boolean
  /** The job's ACTUAL loaded state after the attempt, never an assumption. */
  enabled: boolean
  message: string
}

export async function defaultExecFile(command: string, args: string[]) {
  const { stdout, stderr } = await execFileAsync(command, args)
  return { stdout, stderr }
}

const defaultCheck: CheckFn = (label) => checkLaunchdJob(label)

/**
 * Loads or unloads the Takeshi agent's LaunchAgent.
 *
 * The exit code is NOT the source of truth — the resulting state is. `launchctl
 * unload` on an already-unloaded plist (and `load` on an already-loaded one)
 * exits non-zero even though the job ends up in exactly the requested state, so
 * naive exit-code handling reports a spurious failure. We run the command, then
 * read the real state back and compare it against what was asked for.
 */
export async function setScheduledJobImpl(
  enabled: boolean,
  execFileFn: ExecFileFn = defaultExecFile,
  checkFn: CheckFn = defaultCheck
): Promise<SetScheduledJobResult> {
  let commandError: string | null = null
  try {
    await execFileFn("launchctl", [
      enabled ? "load" : "unload",
      TAKESHI_LAUNCHD_PLIST_PATH,
    ])
  } catch (error) {
    commandError = error instanceof Error ? error.message : String(error)
  }

  const health = await checkFn(TAKESHI_AGENT_LAUNCHD_LABEL)

  if (health.loaded === enabled) {
    return {
      ok: true,
      enabled: health.loaded,
      message: enabled
        ? "Scheduled runs enabled — the agent polls every 5 minutes."
        : "Scheduled runs stopped. A run already in progress will still finish.",
    }
  }

  return {
    ok: false,
    enabled: health.loaded,
    message: commandError
      ? `Could not change scheduled runs: ${commandError}`
      : `Could not change scheduled runs — the job is still ${health.loaded ? "loaded" : "not loaded"}.`,
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run lib/scheduled-job/set-scheduled-job-impl.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add lib/scheduled-job/paths.ts lib/scheduled-job/set-scheduled-job-impl.ts lib/scheduled-job/set-scheduled-job-impl.test.ts
git commit -m "Add launchd load/unload logic, keyed on resulting state not exit code"
```

---

### Task 2: Server Action wrappers

**Files:**
- Create: `lib/scheduled-job/set-scheduled-job.ts`
- Create: `lib/scheduled-job/get-scheduled-job-status.ts`

**Interfaces:**
- Consumes: `setScheduledJobImpl` and `SetScheduledJobResult` from Task 1; `checkLaunchdJob` + `LaunchdHealth` from `lib/adapters/launchd.ts`; `TAKESHI_AGENT_LAUNCHD_LABEL` from `lib/config.ts`.
- Produces:
  - `setScheduledJob(enabled: boolean): Promise<SetScheduledJobResult>`
  - `getScheduledJobStatus(): Promise<LaunchdHealth>`

Both are `"use server"` and take only real domain parameters — no `execFn`, no label, no path. `getScheduledJobStatus` exists so the client can re-read the real state after a toggle rather than trusting its own optimistic guess (the same staleness class of bug v10 fixed for the Run-now button).

- [ ] **Step 1: Write the action that sets state**

`lib/scheduled-job/set-scheduled-job.ts`:

```ts
"use server"

import { setScheduledJobImpl } from "./set-scheduled-job-impl"
import type { SetScheduledJobResult } from "./set-scheduled-job-impl"

export async function setScheduledJob(enabled: boolean): Promise<SetScheduledJobResult> {
  return setScheduledJobImpl(enabled)
}
```

- [ ] **Step 2: Write the action that reads state**

`lib/scheduled-job/get-scheduled-job-status.ts`:

```ts
"use server"

import { checkLaunchdJob } from "../adapters/launchd"
import type { LaunchdHealth } from "../adapters/launchd"
import { TAKESHI_AGENT_LAUNCHD_LABEL } from "../config"

export async function getScheduledJobStatus(): Promise<LaunchdHealth> {
  return checkLaunchdJob(TAKESHI_AGENT_LAUNCHD_LABEL)
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Run the whole suite to confirm nothing regressed**

Run: `npx vitest run`
Expected: all tests pass, including every pre-v31 test unchanged.

- [ ] **Step 5: Commit**

```bash
git add lib/scheduled-job/set-scheduled-job.ts lib/scheduled-job/get-scheduled-job-status.ts
git commit -m "Add scheduled-job Server Actions (set + status re-read)"
```

---

### Task 3: The toggle UI, wired into the card

Component and wiring are ONE task deliberately: a wired-but-unwritten component (or a written-but-unwired one) leaves the branch in a state that does not typecheck, which this project's "every task ends in a working, tested state" rule forbids. This is v18's lesson applied.

**Files:**
- Create: `components/scheduled-job-toggle.tsx`
- Modify: `components/agent-card.tsx` (props block ~lines 19-38, destructure ~lines 48-66, launchd line 103-108)
- Modify: `app/page.tsx` (imports line 1-4, the `Promise.all` ~line 35-40, the `AgentCard` props ~line 75)

**Interfaces:**
- Consumes: `setScheduledJob`, `getScheduledJobStatus` (Task 2); `LaunchdHealth` from `lib/adapters/launchd.ts`; `TAKESHI_LAUNCHD_PLIST_PATH` (Task 1).
- Produces: `ScheduledJobToggle({ health }: { health: LaunchdHealth })`; a new optional `AgentCard` prop `showScheduledJobToggle?: boolean`.

This component has **no mount effect** — the launchctl call happens only on an explicit user confirm. So the Strict-Mode `useRef` guard that v21's `DefineCompanyAiDraft` needed does not apply here; do not add one, and do not add a mount effect.

- [ ] **Step 1: Write the toggle component**

`components/scheduled-job-toggle.tsx`:

```tsx
"use client"

import { useState } from "react"
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import type { LaunchdHealth } from "@/lib/adapters/launchd"
import { setScheduledJob } from "@/lib/scheduled-job/set-scheduled-job"
import { getScheduledJobStatus } from "@/lib/scheduled-job/get-scheduled-job-status"

export function ScheduledJobToggle({ health }: { health: LaunchdHealth }) {
  const [loaded, setLoaded] = useState(health.loaded)
  const [lastExitStatus, setLastExitStatus] = useState(health.lastExitStatus)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  async function handleConfirm() {
    setBusy(true)
    setMessage(null)
    const result = await setScheduledJob(!loaded)
    // Always render the state launchctl actually reports, never an optimistic
    // guess — a failed unload must not render as "off".
    const fresh = await getScheduledJobStatus()
    setLoaded(fresh.loaded)
    setLastExitStatus(fresh.lastExitStatus)
    setMessage(result.message)
    setFailed(!result.ok)
    setBusy(false)
  }

  return (
    <div className="space-y-1">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span>
          Scheduled runs: {loaded ? "on" : "off"}
          {lastExitStatus !== null && ` (last exit ${lastExitStatus})`}
        </span>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" disabled={busy}>
              {busy ? "Working…" : loaded ? "Stop" : "Start"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {loaded ? "Stop scheduled runs?" : "Start scheduled runs?"}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {loaded
                  ? "This stops future scheduled runs. A run already in progress will still finish — this is not a hard stop. “Run now” keeps working either way."
                  : "The agent will resume polling for new email every 5 minutes, unattended."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirm}>Confirm</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </p>
      {message && (
        <p className={`text-xs ${failed ? "text-destructive" : "text-muted-foreground"}`}>{message}</p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add the prop to `AgentCard`**

In `components/agent-card.tsx`, add the import after the other component imports (near line 17):

```tsx
import { ScheduledJobToggle } from "@/components/scheduled-job-toggle"
```

Add to the `AgentCardProps` type, immediately after `launchdHealth?: LaunchdHealth`:

```tsx
  showScheduledJobToggle?: boolean
```

Add to the destructured parameter list, immediately after `launchdHealth,`:

```tsx
  showScheduledJobToggle,
```

- [ ] **Step 3: Make the launchd line interactive**

Replace the whole existing block at `components/agent-card.tsx:103-108`:

```tsx
        {launchdHealth && (
          <p className="text-xs text-muted-foreground">
            launchd: {launchdHealth.loaded ? "loaded" : "not loaded"}
            {launchdHealth.lastExitStatus !== null && ` (last exit ${launchdHealth.lastExitStatus})`}
          </p>
        )}
```

with:

```tsx
        {launchdHealth && showScheduledJobToggle && <ScheduledJobToggle health={launchdHealth} />}
        {launchdHealth && !showScheduledJobToggle && (
          <p className="text-xs text-muted-foreground">
            launchd: {launchdHealth.loaded ? "loaded" : "not loaded"}
            {launchdHealth.lastExitStatus !== null && ` (last exit ${launchdHealth.lastExitStatus})`}
          </p>
        )}
```

The read-only line is kept for the case where the job is known but the plist is missing — the status is still true and worth showing, there is just nothing to toggle.

- [ ] **Step 4: Gate and pass the prop from the page**

In `app/page.tsx`, add to the imports at the top:

```tsx
import fs from "node:fs"
import { TAKESHI_LAUNCHD_PLIST_PATH } from "@/lib/scheduled-job/paths"
```

Immediately after the existing `Promise.all` destructuring (~line 40), add:

```tsx
  // The toggle needs a plist to load/unload. A fresh install has neither the
  // agent nor the plist, so it sees nothing.
  const takeshiPlistExists = Boolean(takeshiAgent) && fs.existsSync(TAKESHI_LAUNCHD_PLIST_PATH)
```

Then in the `AgentCard` props, immediately after the existing `launchdHealth={...}` line (~line 75):

```tsx
                showScheduledJobToggle={isTakeshiAgent && takeshiPlistExists}
```

- [ ] **Step 5: Typecheck and run the full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: no type errors; all tests pass.

- [ ] **Step 6: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 7: Commit**

```bash
git add components/scheduled-job-toggle.tsx components/agent-card.tsx app/page.tsx
git commit -m "Add scheduled-runs toggle to the Takeshi agent card"
```

---

### Task 4: Live verification against a disposable launchd job

**Files:** none modified — this task only creates and deletes a throwaway plist under `~/Library/LaunchAgents/`.

Proves the real `launchctl` code path works end-to-end **without touching `com.plh.takeshi-agent`**, per the standing safety rule and the user's explicit choice.

- [ ] **Step 1: Create the disposable job**

```bash
cat > "$HOME/Library/LaunchAgents/com.alacran.testjob.plist" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.alacran.testjob</string>
  <key>ProgramArguments</key>
  <array><string>/usr/bin/true</string></array>
  <key>RunAtLoad</key><false/>
</dict>
</plist>
EOF
plutil -lint "$HOME/Library/LaunchAgents/com.alacran.testjob.plist"
```

Expected: `OK`.

- [ ] **Step 2: Record the Takeshi job's state, so it can be proven untouched**

```bash
launchctl list com.plh.takeshi-agent | grep -E "LastExitStatus|Label"
```

Note the output. It must be identical at the end of this task.

- [ ] **Step 3: Exercise the real code path against the disposable job**

Write `/tmp/v31-live-check.mjs`. Note what this does and does not prove: it **cannot** call `setScheduledJobImpl` directly, because that function's plist path is a hardcoded constant pointing at the real Takeshi job (deliberately — see Global Constraints), and pointing it elsewhere would defeat the reason the constant exists. So the script reproduces the same argv shape against the disposable job to verify the **OS-level contract the impl depends on**: that `launchctl load`/`unload` move the job as expected, and that a redundant `unload` exits non-zero while still leaving the job in the requested state. Task 1's unit tests cover the impl's own logic; this covers the assumption underneath it.

```js
import { execFile } from "node:child_process"
import { promisify } from "node:util"
const execFileAsync = promisify(execFile)
const PLIST = `${process.env.HOME}/Library/LaunchAgents/com.alacran.testjob.plist`

async function loadedNow() {
  try {
    await execFileAsync("launchctl", ["list", "com.alacran.testjob"])
    return true
  } catch {
    return false
  }
}

for (const [action, want] of [["load", true], ["unload", false], ["unload", false]]) {
  let err = null
  try {
    await execFileAsync("launchctl", [action, PLIST])
  } catch (e) {
    err = e.message
  }
  const got = await loadedNow()
  console.log(`${action} -> loaded=${got} want=${want} match=${got === want} err=${err ? "yes" : "no"}`)
}
```

Run: `node /tmp/v31-live-check.mjs`

Expected output — note the third line is the key case, where the command errors but the state matches, which the impl must treat as success:

```
load -> loaded=true want=true match=true err=no
unload -> loaded=false want=false match=true err=no
unload -> loaded=false want=false match=true err=yes
```

- [ ] **Step 4: Confirm the resulting-state logic agrees**

Confirm all three lines report `match=true`, and that the third has `err=yes` alongside it. That is the exact combination `setScheduledJobImpl` maps to `ok: true` — real evidence for the behaviour Task 1's third test asserts with a mock.

- [ ] **Step 5: Clean up and prove Takeshi untouched**

```bash
launchctl unload "$HOME/Library/LaunchAgents/com.alacran.testjob.plist" 2>/dev/null
rm -f "$HOME/Library/LaunchAgents/com.alacran.testjob.plist" /tmp/v31-live-check.mjs
launchctl list com.alacran.testjob 2>&1 | head -1   # expect: "Could not find service"
launchctl list com.plh.takeshi-agent | grep -E "LastExitStatus|Label"
cd ~/AI-Native/plh-takeshi-agent && git status --short   # expect: empty
```

Expected: the disposable job is gone; the Takeshi job's output matches Step 2 exactly; that repo's working tree is clean.

- [ ] **Step 6: Render the UI and confirm the control appears**

Start a dev server on a throwaway port (never 3000), load `/`, and confirm the Takeshi card now shows `Scheduled runs: on` with a **Stop** button, and that the confirm dialog opens with the stop-copy. **Do not click Confirm** — the real toggle against the real job is the user's to make.

- [ ] **Step 7: Commit (only if any fix was needed)**

If Steps 1-6 revealed a bug, fix it, re-run Task 1's tests plus `npx tsc --noEmit`, and commit. If nothing needed fixing, there is nothing to commit — this task's deliverable is the evidence, not a code change.

---

### Task 5: Documentation

**Files:**
- Modify: `CHANGELOG.md` (prepend a new `## v31` section in the same style as the existing entries)
- Modify: `README.md` (only if it is now untrue)
- Modify: `CLAUDE.md` ("Current state" section)

- [ ] **Step 1: Add the CHANGELOG entry**

Append a dated `## v31: scheduled-runs toggle for the Takeshi agent` section matching the surrounding entries' voice and level of detail. It must state: what shipped; that the resulting state — not the exit code — is the authority, and why (`unload` on an already-unloaded plist exits non-zero); that unload does **not** kill an in-flight run; that the control is gated on the agent existing AND the plist existing, so a fresh install sees nothing; that it is deliberately bespoke to one agent id like v2/v9/v19; and that live verification used a disposable `com.alacran.testjob` rather than the real job, per the standing safety rule.

- [ ] **Step 2: Check README truthfulness**

Search `README.md` for claims about what the app can do with the example agents. If it says the dashboard can only start/observe them, update it. If it makes no such claim, change nothing — do not pad it.

Run: `grep -niE "launchd|scheduled|takeshi|poll" README.md`

- [ ] **Step 3: Update `CLAUDE.md`'s "Current state"**

Change `**Shipped: v1–v30**` to `**Shipped: v1–v31**` and add two or three sentences on v31 in the established voice, pointing at this plan's spec file. Also note the finding recorded in the spec: that agent repo's `claude-agent-settings.json` guardrail hook has pointed at a stale pre-reorg path since 2026-07-22 and is therefore inactive — relevant standing context for the coming slices that retire the daemon.

- [ ] **Step 4: Commit**

```bash
git add CHANGELOG.md CLAUDE.md README.md
git commit -m "Document v31: scheduled-runs toggle"
```

---

## Self-Review

**1. Spec coverage.** Every spec section maps to a task: module + hardcoded constants + resulting-state-not-exit-code → Task 1; the two zero-extra-parameter Server Actions → Task 2; interactive line, both-direction confirm dialogs, in-flight disclosure, Run-now independence, post-toggle refresh, plist+agent gating, bespoke-to-one-agent → Task 3; disposable-job live test and the never-touch-Takeshi rule → Task 4; the backup and the dead-guardrail finding are recorded in the spec and surfaced in Task 5's docs. `lib/adapters/launchd.ts` stays unmodified throughout, as the spec requires. "No new state file" holds — nothing in any task creates one.

**2. Placeholders.** None. Every code step carries real, complete code; every command step carries the exact command and its expected output. Task 4 Step 7 is conditional by design (evidence, not a diff), not a placeholder. Task 5 Steps 1-3 specify required content precisely rather than pasting prose that would go stale against the surrounding file's voice.

**3. Type consistency.** `ExecFileFn`, `CheckFn`, `SetScheduledJobResult`, `LaunchdHealth`, `TAKESHI_LAUNCHD_PLIST_PATH`, `TAKESHI_AGENT_LAUNCHD_LABEL`, `setScheduledJobImpl`, `setScheduledJob`, `getScheduledJobStatus`, `ScheduledJobToggle`, `showScheduledJobToggle` are each spelled identically at every point of definition and use. `SetScheduledJobResult.enabled` carries the *actual* post-attempt state in both the impl and the component, which reads it via the separate `getScheduledJobStatus()` call rather than trusting it — consistent with the spec's rule that displayed state always comes from `checkLaunchdJob()`.
