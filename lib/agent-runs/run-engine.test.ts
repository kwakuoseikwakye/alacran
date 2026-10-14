import { vi, afterEach, beforeEach, describe, expect, it } from "vitest"
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { defaultExecFile } from "../default-exec-file"
import { AI_EXECUTORS } from "../ai-executors"
import { _clearSessionsForTest, _setSessionForTest, closeSession, getSession } from "../terminal/sessions"
import { readRunRecords } from "./records"
import {
  CHECK_EVERY_TICKS,
  RUN_TIME_LIMIT_MS,
  _resetReconcileForTest,
  askForChangesImpl,
  defaultRunDeps,
  discardRunImpl,
  keepRunImpl,
  listRunsImpl,
  runChangesImpl,
  runFileDiffImpl,
  takeOverImpl,
  matchesRunProcess,
  reconcileRunsImpl,
  startRunImpl,
  type RunDeps,
} from "./run-engine"

// Every test here drives real git (worktrees, commits, merges). Alone they take
// well under a second; in the full suite, ~300 files run in parallel and git
// I/O can outlast vitest's 5s default. The limit is raised, not the assertions.
vi.setConfig({ testTimeout: 20_000 })

let dir: string
let repo: string
const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", ["-C", cwd, "-c", "user.name=t", "-c", "user.email=t@t", ...args], { encoding: "utf-8" })
const event = (e: object) => `${JSON.stringify(e)}\n`

/** Everything the engine touches, faked except git (a real temp repo). */
function harness(over: Partial<RunDeps> = {}) {
  const state = {
    alive: true,
    now: 1_000_000,
    pid: 4242 as number | undefined,
    killed: [] as number[],
    spawned: [] as { command: string; args: string[]; cwd: string; detached: boolean }[],
    tick: (() => {}) as () => unknown,
  }
  const deps: RunDeps = {
    getAgents: async () => [
      { id: "acme", name: "Acme", rootPath: repo, kind: "command-set" },
      { id: "ext", name: "Ext", rootPath: repo, kind: "external" },
    ],
    resolveExecutor: async () => AI_EXECUTORS["claude-code"],
    exec: defaultExecFile,
    spawn: (command, args, options) => {
      state.spawned.push({ command, args, cwd: options.cwd, detached: options.detached })
      return { pid: state.pid, unref() {}, on() {} }
    },
    isAlive: () => state.alive,
    isRunProcess: async () => true,
    kill: (pid) => void state.killed.push(pid),
    now: () => state.now,
    newId: () => ID,
    runsDir: (agentId) => path.join(dir, "runs", agentId),
    worktreeDir: (agentId, id) => path.join(dir, "worktrees", agentId, id),
    schedule: (fn) => {
      state.tick = fn
      return () => void (state.tick = () => {})
    },
    ...over,
  }
  /** Drive the watcher through one liveness check, awaiting each tick (and so
   *  any settle it starts) rather than sleeping and hoping. */
  const check = async () => {
    for (let i = 0; i < CHECK_EVERY_TICKS; i++) await state.tick()
  }
  return { state, deps, check }
}

const ID = "0123456789abcdef0123456789abcdef"
const logOf = () => path.join(dir, "runs", "acme", `${ID}.log`)
const worktree = () => path.join(dir, "worktrees", "acme", ID)
const record = async () => (await readRunRecords(path.join(dir, "runs", "acme")))[0]

beforeEach(() => {
  _clearSessionsForTest()
  dir = mkdtempSync(path.join(tmpdir(), "run-engine-"))
  repo = path.join(dir, "company")
  execFileSync("git", ["init", "-q", "-b", "master", repo])
  writeFileSync(path.join(repo, "notes.md"), "v1\n")
  git(repo, "add", "-A")
  git(repo, "commit", "-q", "-m", "init")
})
afterEach(() => {
  _clearSessionsForTest()
  rmSync(dir, { recursive: true, force: true })
})

describe("startRunImpl — refusals", () => {
  it("refuses an empty task, an external folder, and an executor that can't stream", async () => {
    const { deps } = harness()
    expect(await startRunImpl("acme", { task: "   " }, deps)).toMatchObject({ ok: false })
    expect(await startRunImpl("ext", { task: "x" }, deps)).toMatchObject({ ok: false })
    const kiro = harness({ resolveExecutor: async () => AI_EXECUTORS.kiro })
    const refused = await startRunImpl("acme", { task: "x" }, kiro.deps)
    expect(refused).toMatchObject({ ok: false })
    expect((refused as { message: string }).message).toContain(AI_EXECUTORS.kiro.label)
    expect(kiro.state.spawned).toEqual([])
  })

  it("refuses past the per-company limit without spawning", async () => {
    const { deps, state } = harness()
    for (let i = 0; i < 8; i++) {
      _setSessionForTest({
        id: `s${i}`,
        agentId: "acme",
        kind: "shell",
        label: "x",
        startedAt: 1,
        pty: {} as never,
        backlog: { push() {}, text: () => "" },
        listeners: new Set(),
      })
    }
    expect(await startRunImpl("acme", { task: "x" }, deps)).toMatchObject({ ok: false })
    expect(state.spawned).toEqual([])
  })
})

describe("startRunImpl — a run", () => {
  it("starts the agent detached, in its own worktree, with the streaming argv, as a read-only tab", async () => {
    const { deps, state } = harness()
    const started = await startRunImpl("acme", { task: "Tidy the pricing note", title: "Tidy pricing" }, deps)
    expect(started).toEqual({ ok: true, id: ID, label: "Tidy pricing", dirty: false })
    expect(state.spawned).toHaveLength(1)
    expect(state.spawned[0]).toMatchObject({ command: "claude", cwd: worktree(), detached: true })
    expect(state.spawned[0].args).toContain("stream-json")
    expect(git(worktree(), "branch", "--show-current").trim()).toBe(`alacran/agent/${ID}`)
    expect(getSession("acme", ID)?.kind).toBe("run")
    expect((await record()).status).toBe("running")
  })

  it("says so when the company has unsaved edits, and still starts from the last commit", async () => {
    writeFileSync(path.join(repo, "notes.md"), "unsaved\n")
    const { deps } = harness()
    expect(await startRunImpl("acme", { task: "x" }, deps)).toMatchObject({ ok: true, dirty: true })
  })

  it("streams the log into the tab, and on exit commits the changes and marks it for review", async () => {
    const { deps, state, check } = harness()
    await startRunImpl("acme", { task: "Tidy", title: "Tidy" }, deps)
    appendFileSync(logOf(), event({ type: "system", subtype: "init" }))
    appendFileSync(
      logOf(),
      event({
        type: "assistant",
        message: { content: [{ type: "tool_use", name: "Edit", input: { file_path: `${worktree()}/notes.md` } }] },
      })
    )
    writeFileSync(path.join(worktree(), "notes.md"), "v2\n")
    appendFileSync(logOf(), event({ type: "result", subtype: "success", is_error: false }))
    state.alive = false
    await check()
    expect(await record()).toMatchObject({ status: "needs-review", changedFiles: 1 })
    expect(git(worktree(), "log", "-1", "--format=%s").trim()).toBe("Agent: Tidy")
    const feed = getSession("acme", ID)!.backlog.text()
    expect(feed).toContain("✎ Editing notes.md")
    expect(feed).toContain("Finished")
    expect(git(repo, "log", "-1", "--format=%s", "master").trim()).toBe("init")
  })

  it("shortens paths the agent reports through a symlink (macOS /tmp, /var) to the worktree", async () => {
    const { deps, state, check } = harness()
    await startRunImpl("acme", { task: "Tidy" }, deps)
    // Claude reports the RESOLVED path; on macOS the temp dir is behind /private.
    const real = realpathSync(worktree())
    appendFileSync(
      logOf(),
      event({ type: "assistant", message: { content: [{ type: "tool_use", name: "Edit", input: { file_path: `${real}/notes.md` } }] } })
    )
    state.alive = false
    await check()
    expect(getSession("acme", ID)!.backlog.text()).toContain("✎ Editing notes.md")
  })

  it("finishes with no changes as no-changes", async () => {
    const { deps, state, check } = harness()
    await startRunImpl("acme", { task: "Look around" }, deps)
    appendFileSync(logOf(), event({ type: "result", subtype: "success", is_error: false }))
    state.alive = false
    await check()
    expect((await record()).status).toBe("no-changes")
  })

  it("a run whose process never started settles as failed", async () => {
    const { deps, state, check } = harness()
    state.pid = undefined // spawn gave no pid: the binary could not be started
    await startRunImpl("acme", { task: "x" }, deps)
    await check()
    expect((await record()).status).toBe("failed")
  })

  it("stops a run that goes past the time limit, after checking the pid is still the agent", async () => {
    const { deps, state, check } = harness()
    await startRunImpl("acme", { task: "x" }, deps)
    state.now += RUN_TIME_LIMIT_MS + 1
    await check()
    expect(state.killed).toEqual([4242])
    state.alive = false
    await check()
    expect(await record()).toMatchObject({ status: "failed", reason: "Took longer than an hour, so it was stopped." })
  })

  it("closing the run's tab stops the agent and still saves what it changed", async () => {
    const { deps, state, check } = harness()
    await startRunImpl("acme", { task: "x", title: "Half done" }, deps)
    writeFileSync(path.join(worktree(), "notes.md"), "partial\n")
    closeSession("acme", ID)
    await new Promise((r) => setTimeout(r, 20))
    expect(state.killed).toEqual([4242])
    state.alive = false
    await check()
    expect(await record()).toMatchObject({ status: "failed", reason: "Stopped before it finished.", changedFiles: 1 })
    expect(existsSync(worktree())).toBe(true)
  })
})

describe("reconcileRunsImpl", () => {
  beforeEach(() => _resetReconcileForTest())

  /** A run the previous server started, then forgot when it restarted. */
  async function orphan(deps: RunDeps) {
    await startRunImpl("acme", { task: "x", title: "Orphan" }, deps)
    // The restart: sessions and watchers are memory, records are disk.
    _clearSessionsForTest()
    _resetReconcileForTest()
  }

  it("reattaches a run that is still working, as a tab again", async () => {
    const { deps } = harness()
    await orphan(deps)
    await reconcileRunsImpl("acme", deps)
    expect(getSession("acme", ID)?.kind).toBe("run")
  })

  it("settles a run whose process died while the app was closed as interrupted, keeping its changes", async () => {
    const { deps, state } = harness()
    await orphan(deps)
    writeFileSync(path.join(worktree(), "notes.md"), "partial\n")
    state.alive = false
    await reconcileRunsImpl("acme", deps)
    expect(getSession("acme", ID)).toBeUndefined()
    expect(await record()).toMatchObject({ status: "interrupted", changedFiles: 1 })
  })

  it("settles a run that finished while the app was closed from its log's result", async () => {
    const { deps, state } = harness()
    await orphan(deps)
    writeFileSync(path.join(worktree(), "notes.md"), "done\n")
    appendFileSync(logOf(), event({ type: "result", subtype: "success", is_error: false }))
    state.alive = false
    await reconcileRunsImpl("acme", deps)
    expect(await record()).toMatchObject({ status: "needs-review", changedFiles: 1 })
  })

  it("a live pid that isn't the agent any more is settled, not reattached", async () => {
    const { deps } = harness()
    await orphan(deps)
    await reconcileRunsImpl("acme", { ...deps, isRunProcess: async () => false })
    expect(getSession("acme", ID)).toBeUndefined()
    expect((await record()).status).toBe("interrupted")
  })

  it("runs once per company per server process", async () => {
    const { deps, state } = harness()
    await orphan(deps)
    await reconcileRunsImpl("acme", deps) // alive: reattached, still running
    _clearSessionsForTest()
    state.alive = false
    await reconcileRunsImpl("acme", deps) // second call is a no-op: not settled
    expect((await record()).status).toBe("running")
  })
})

describe("which process is the agent", () => {
  const started = "2026-09-25T10:00:00.000Z"

  it("is the agent only if it is the right program AND started when the run did", () => {
    // ps's `lstart`: "Thu Sep 25 10:00:00 2026", local time.
    const psStart = (d: Date) => d.toDateString().slice(0, 10) + " " + d.toTimeString().slice(0, 8) + " " + d.getFullYear()
    const at = new Date(started)
    expect(matchesRunProcess("claude -p You are working unattended", psStart(at), "claude", started)).toBe(true)
    // The user's own interactive claude, started an hour later, reusing the pid after a reboot.
    expect(matchesRunProcess("claude", psStart(new Date(at.getTime() + 3_600_000)), "claude", started)).toBe(false)
    expect(matchesRunProcess("node server.js", psStart(at), "claude", started)).toBe(false)
  })

  it("asks the real process table (checked against this test process)", async () => {
    const began = new Date(Date.now() - process.uptime() * 1000).toISOString()
    expect(await defaultRunDeps.isRunProcess(process.pid, "node", began)).toBe(true)
    expect(await defaultRunDeps.isRunProcess(process.pid, "node", "2020-01-01T00:00:00.000Z")).toBe(false)
  })
})

describe("run engine — failure paths", () => {
  beforeEach(() => _resetReconcileForTest())

  it("refuses a task with a NUL character before making anything", async () => {
    const { deps, state } = harness()
    expect(await startRunImpl("acme", { task: "a\u0000b" }, deps)).toMatchObject({ ok: false })
    expect(state.spawned).toEqual([])
    expect(existsSync(worktree())).toBe(false)
  })

  it("a spawn that throws cleans up its worktree and branch and leaves no record", async () => {
    const { deps } = harness({
      spawn: () => {
        throw new Error("spawn EINVAL")
      },
    })
    expect(await startRunImpl("acme", { task: "x" }, deps)).toMatchObject({ ok: false })
    expect(existsSync(worktree())).toBe(false)
    expect(git(repo, "branch", "--list", `alacran/agent/${ID}`).trim()).toBe("")
    expect(await record()).toBeUndefined()
  })

  it("a settle that can't save its record says so in the pane instead of failing silently", async () => {
    const { deps, state, check } = harness()
    await startRunImpl("acme", { task: "x" }, deps)
    state.tick() // opens the log
    const runs = path.join(dir, "runs", "acme")
    rmSync(runs, { recursive: true, force: true })
    writeFileSync(runs, "not a folder") // every record write now fails
    state.alive = false
    await check()
    expect(getSession("acme", ID)!.backlog.text()).toContain("Couldn't save how this run ended")
  })

  it("two first requests at once both wait for the runs to be put back", async () => {
    const { deps } = harness()
    await startRunImpl("acme", { task: "x" }, deps)
    _clearSessionsForTest()
    _resetReconcileForTest()
    const first = reconcileRunsImpl("acme", deps)
    await reconcileRunsImpl("acme", deps)
    expect(getSession("acme", ID)?.kind).toBe("run")
    await first
  })

  it("does not attach a second watcher to a run whose tab was just closed but is still stopping", async () => {
    const { deps } = harness()
    await startRunImpl("acme", { task: "x" }, deps)
    closeSession("acme", ID) // tab gone; the process takes a moment to die
    await reconcileRunsImpl("acme", deps)
    expect(getSession("acme", ID)).toBeUndefined()
  })

  it("a run older than the limit that is still alive is reattached and then stopped, not orphaned", async () => {
    const { deps, state, check } = harness()
    await startRunImpl("acme", { task: "x" }, deps)
    _clearSessionsForTest()
    _resetReconcileForTest()
    state.now += RUN_TIME_LIMIT_MS + 60_000
    await reconcileRunsImpl("acme", deps)
    expect(getSession("acme", ID)?.kind).toBe("run")
    await check()
    expect(state.killed).toEqual([4242])
  })
})


describe("the run's summary", () => {
  it("is saved on the record when the run finishes", async () => {
    const { deps, state, check } = harness()
    await startRunImpl("acme", { task: "Tidy" }, deps)
    appendFileSync(logOf(), event({ type: "result", subtype: "success", is_error: false, result: "Tidied it." }))
    state.alive = false
    await check()
    expect((await record()).summary).toBe("Tidied it.")
  })
})

describe("keeping and discarding a run", () => {
  beforeEach(() => _resetReconcileForTest())

  /** A run that edited notes.md and finished successfully. */
  async function settled(edit = "agent\n") {
    const h = harness()
    await startRunImpl("acme", { task: "Tidy", title: "Tidy" }, h.deps)
    writeFileSync(path.join(worktree(), "notes.md"), edit)
    appendFileSync(logOf(), event({ type: "result", subtype: "success", is_error: false, result: "Tidied." }))
    h.state.alive = false
    await h.check()
    return h
  }
  const branchExists = () => git(repo, "branch", "--list", `alacran/agent/${ID}`).trim() !== ""

  it("keep merges the run into the company and forgets it", async () => {
    const { deps } = await settled()
    const kept = await keepRunImpl("acme", ID, deps)
    expect(kept).toEqual({ ok: true, message: "Kept. 1 file from this agent is now in Acme." })
    expect(git(repo, "show", "HEAD:notes.md")).toBe("agent\n")
    expect(git(repo, "log", "-1", "--format=%s").trim()).toBe("Keep agent run: Tidy")
    expect(existsSync(worktree())).toBe(false)
    expect(branchExists()).toBe(false)
    expect(await record()).toBeUndefined()
    expect(existsSync(logOf())).toBe(false)
    expect(getSession("acme", ID)).toBeUndefined()
  })

  it("keep refuses a conflict and changes nothing", async () => {
    const { deps } = await settled()
    writeFileSync(path.join(repo, "notes.md"), "company\n")
    git(repo, "commit", "-qam", "company edit")
    const refused = await keepRunImpl("acme", ID, deps)
    expect(refused).toMatchObject({ ok: false, files: ["notes.md"] })
    expect((refused as { message: string }).message).toContain("overlaps")
    expect(git(repo, "log", "-1", "--format=%s").trim()).toBe("company edit")
    expect(existsSync(worktree())).toBe(true)
    expect((await record()).status).toBe("needs-review")
  })

  it("keep refuses while unsaved edits would be overwritten, naming the file", async () => {
    const { deps } = await settled()
    writeFileSync(path.join(repo, "notes.md"), "unsaved\n")
    const refused = await keepRunImpl("acme", ID, deps)
    expect((refused as { message: string }).message).toContain("notes.md")
    expect(git(repo, "status", "--porcelain").trim()).toBe("M notes.md")
  })

  it("won't keep or discard a run that is still working", async () => {
    const { deps } = harness()
    await startRunImpl("acme", { task: "x" }, deps)
    expect(await keepRunImpl("acme", ID, deps)).toMatchObject({ ok: false })
    expect(await discardRunImpl("acme", ID, deps)).toMatchObject({ ok: false })
    expect(existsSync(worktree())).toBe(true)
  })

  it("discard throws the run away and leaves the company as it was", async () => {
    const { deps } = await settled()
    const head = git(repo, "rev-parse", "HEAD")
    expect(await discardRunImpl("acme", ID, deps)).toMatchObject({ ok: true })
    expect(existsSync(worktree())).toBe(false)
    expect(branchExists()).toBe(false)
    expect(await record()).toBeUndefined()
    expect(git(repo, "rev-parse", "HEAD")).toBe(head)
  })

  it("lists each run under the AI recorded for it, not the default one", async () => {
    // Only Claude Code may run unattended today, so give a real run's record another AI.
    const h = harness()
    await startRunImpl("acme", { task: "Tidy", title: "Tidy" }, h.deps)
    const file = path.join(dir, "runs", "acme", `${ID}.json`)
    writeFileSync(file, JSON.stringify({ ...JSON.parse(readFileSync(file, "utf-8")), executorId: "kimi" }))
    expect(await listRunsImpl("acme", h.deps)).toEqual([expect.objectContaining({ id: ID, executorId: "kimi" })])
  })

  it("lists runs for the cards, with each run's changed files", async () => {
    const { deps } = await settled()
    expect(await listRunsImpl("acme", deps)).toEqual([
      expect.objectContaining({ id: ID, title: "Tidy", status: "needs-review", changedFiles: 1, summary: "Tidied.", executorId: "claude-code" }),
    ])
    expect(await runChangesImpl("acme", ID, deps)).toEqual({ files: [{ status: "M", path: "notes.md" }], ignored: [] })
    expect(await runChangesImpl("acme", "ffffffffffffffffffffffffffffffff", deps)).toBeNull()
  })
})

describe("asking a finished run for changes", () => {
  beforeEach(() => _resetReconcileForTest())

  async function settledHarness() {
    const h = harness()
    await startRunImpl("acme", { task: "Tidy", title: "Tidy" }, h.deps)
    writeFileSync(path.join(worktree(), "notes.md"), "first pass\n")
    appendFileSync(logOf(), event({ type: "result", subtype: "success", is_error: false }))
    h.state.alive = false
    await h.check()
    h.state.alive = true
    h.state.spawned.length = 0
    return h
  }

  it("resumes the same conversation in the same worktree with the feedback, as the same tab", async () => {
    const { deps, state } = await settledHarness()
    const asked = await askForChangesImpl("acme", ID, "Also add a heading.", deps)
    expect(asked).toMatchObject({ ok: true })
    expect(state.spawned).toHaveLength(1)
    expect(state.spawned[0].args[0]).toBe("--continue")
    expect(state.spawned[0].args.join(" ")).toContain("Also add a heading.")
    expect(state.spawned[0].cwd).toBe(worktree())
    expect((await record()).status).toBe("running")
    expect(getSession("acme", ID)!.backlog.text()).toContain("Also add a heading.")
  })

  it("counts the first pass's files as well when the second pass finishes", async () => {
    const { deps, state, check } = await settledHarness()
    await askForChangesImpl("acme", ID, "Add another file.", deps)
    writeFileSync(path.join(worktree(), "extra.md"), "second pass\n")
    appendFileSync(logOf(), event({ type: "result", subtype: "success", is_error: false }))
    state.alive = false
    await check()
    expect(await record()).toMatchObject({ status: "needs-review", changedFiles: 2 })
  })

  it("resumes with the run's own executor even if the company has switched since", async () => {
    const { deps, state } = await settledHarness()
    const switched = { ...deps, resolveExecutor: async () => AI_EXECUTORS.kiro }
    expect(await askForChangesImpl("acme", ID, "More.", switched)).toMatchObject({ ok: true })
    expect(state.spawned[0].command).toBe("claude")
  })

  it("refuses empty feedback, a run that is still working, and an unknown run", async () => {
    const { deps } = await settledHarness()
    expect(await askForChangesImpl("acme", ID, "  ", deps)).toMatchObject({ ok: false })
    expect(await askForChangesImpl("acme", "ffffffffffffffffffffffffffffffff", "x", deps)).toMatchObject({ ok: false })
    await askForChangesImpl("acme", ID, "one", deps)
    expect(await askForChangesImpl("acme", ID, "two", deps)).toMatchObject({ ok: false })
  })
})

describe("landing safety", () => {
  beforeEach(() => _resetReconcileForTest())

  async function settledWith(edit: (wt: string) => void) {
    const h = harness()
    await startRunImpl("acme", { task: "Tidy", title: "Tidy" }, h.deps)
    edit(worktree())
    appendFileSync(logOf(), event({ type: "result", subtype: "success", is_error: false }))
    h.state.alive = false
    await h.check()
    h.state.alive = true
    return h
  }

  it("after a restart, a second pass that died without finishing is interrupted, not the first pass's success", async () => {
    const { deps, state } = await settledWith((wt) => writeFileSync(path.join(wt, "notes.md"), "pass one\n"))
    await askForChangesImpl("acme", ID, "More.", deps)
    _clearSessionsForTest()
    _resetReconcileForTest() // the restart
    state.alive = false
    await reconcileRunsImpl("acme", deps)
    expect((await record()).status).toBe("interrupted")
  })

  it("two Ask for changes at once start one agent, not two", async () => {
    const { deps, state } = await settledWith((wt) => writeFileSync(path.join(wt, "notes.md"), "x\n"))
    state.spawned.length = 0
    const results = await Promise.all([askForChangesImpl("acme", ID, "a", deps), askForChangesImpl("acme", ID, "b", deps)])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(state.spawned).toHaveLength(1)
  })

  it("a keep and a discard at once: one happens, the other is refused", async () => {
    const { deps } = await settledWith((wt) => writeFileSync(path.join(wt, "notes.md"), "x\n"))
    const results = await Promise.all([keepRunImpl("acme", ID, deps), discardRunImpl("acme", ID, deps)])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
  })

  it("won't send back a run that changed its own AI settings", async () => {
    const { deps, state } = await settledWith((wt) => {
      mkdirSync(path.join(wt, ".claude"), { recursive: true })
      writeFileSync(path.join(wt, ".claude", "settings.json"), '{"hooks":{}}\n')
    })
    state.spawned.length = 0
    const refused = await askForChangesImpl("acme", ID, "More.", deps)
    expect(refused).toMatchObject({ ok: false })
    expect((refused as { message: string }).message).toContain(".claude/settings.json")
    expect(state.spawned).toEqual([])
  })

  it("discard names the ignored files it throws away", async () => {
    writeFileSync(path.join(repo, ".gitignore"), "state/*\n")
    git(repo, "add", "-A")
    git(repo, "commit", "-qm", "ignore state")
    const { deps } = await settledWith((wt) => {
      writeFileSync(path.join(wt, "notes.md"), "x\n")
      mkdirSync(path.join(wt, "state"), { recursive: true })
      writeFileSync(path.join(wt, "state", "out.txt"), "generated\n")
    })
    expect(await runChangesImpl("acme", ID, deps)).toMatchObject({ ignored: ["state/out.txt"] })
    const discarded = await discardRunImpl("acme", ID, deps)
    expect((discarded as { message: string }).message).toContain("state/out.txt")
  })
})

describe("taking over a run", () => {
  beforeEach(() => _resetReconcileForTest())

  async function settledHarness(edit: (wt: string) => void = (wt) => writeFileSync(path.join(wt, "notes.md"), "agent\n")) {
    const h = harness()
    await startRunImpl("acme", { task: "Tidy", title: "Tidy" }, h.deps)
    edit(worktree())
    appendFileSync(logOf(), event({ type: "result", subtype: "success", is_error: false }))
    h.state.alive = false
    await h.check()
    return h
  }

  /** Stands in for openSession: records what it was asked, and lets the test end the program. */
  function fakeOpen() {
    const calls: { sessionId: string; cwd: string; kind?: string; launch?: { file: string; args: string[] }; onExit?: () => void }[] = []
    const open = (async (options: (typeof calls)[number]) => {
      calls.push(options)
      return { id: options.sessionId, label: "You · Tidy" }
    }) as unknown as Parameters<typeof takeOverImpl>[3]
    return { calls, open }
  }

  it("opens an interactive session that continues the run's conversation in its worktree", async () => {
    const { deps } = await settledHarness()
    const { calls, open } = fakeOpen()
    const taken = await takeOverImpl("acme", ID, deps, open)
    expect(taken).toMatchObject({ ok: true })
    expect(calls[0]).toMatchObject({ cwd: worktree(), kind: "ai", launch: { file: "claude", args: ["--continue"] } })
    expect((await listRunsImpl("acme", deps))[0]).toMatchObject({ driving: true })
  })

  it("while the person drives, keep, discard, ask and a second take over are refused", async () => {
    const { deps } = await settledHarness()
    const { open } = fakeOpen()
    await takeOverImpl("acme", ID, deps, open)
    // One after another: started together, all but the first would meet the
    // one-action-at-a-time guard instead of the driving one.
    for (const attempt of [
      () => keepRunImpl("acme", ID, deps),
      () => discardRunImpl("acme", ID, deps),
      () => askForChangesImpl("acme", ID, "more", deps),
      () => takeOverImpl("acme", ID, deps, open),
    ]) {
      expect((await attempt()) as { message: string }).toMatchObject({ ok: false, message: expect.stringContaining("Close your tab") })
    }
  })

  it("when the person closes it, their edits are committed and the run is back for review", async () => {
    const { deps } = await settledHarness()
    const { calls, open } = fakeOpen()
    await takeOverImpl("acme", ID, deps, open)
    writeFileSync(path.join(worktree(), "mine.md"), "the person's edit\n")
    calls[0].onExit!()
    // The commit is real git, and under a full suite's load it takes a while:
    // wait for its result rather than a guess at how long it takes.
    for (let i = 0; i < 250 && (await record()).changedFiles !== 2; i++) await new Promise((r) => setTimeout(r, 20))
    expect(await record()).toMatchObject({ status: "needs-review", changedFiles: 2 })
    expect((await listRunsImpl("acme", deps))[0]).toMatchObject({ driving: false })
  })

  it("won't take over a run that changed its own AI settings", async () => {
    const { deps } = await settledHarness((wt) => {
      mkdirSync(path.join(wt, ".claude"), { recursive: true })
      writeFileSync(path.join(wt, ".claude", "settings.json"), "{}\n")
    })
    const { calls, open } = fakeOpen()
    expect(await takeOverImpl("acme", ID, deps, open)).toMatchObject({ ok: false })
    expect(calls).toEqual([])
  })
})

describe("a changed file's before and after", () => {
  beforeEach(() => _resetReconcileForTest())

  it("shows a file the run changed, and nothing else", async () => {
    const h = harness()
    await startRunImpl("acme", { task: "Tidy" }, h.deps)
    writeFileSync(path.join(worktree(), "notes.md"), "v2\n")
    appendFileSync(logOf(), event({ type: "result", subtype: "success", is_error: false }))
    h.state.alive = false
    await h.check()
    expect(await runFileDiffImpl("acme", ID, "notes.md", h.deps)).toEqual({ before: "v1\n", after: "v2\n" })
    expect(await runFileDiffImpl("acme", ID, "../../etc/passwd", h.deps)).toBeNull()
    expect(await runFileDiffImpl("acme", ID, "other.md", h.deps)).toBeNull()
  })
})

describe("the review sees everything in the agent's copy", () => {
  beforeEach(() => _resetReconcileForTest())

  async function settled() {
    const h = harness()
    await startRunImpl("acme", { task: "Tidy", title: "Tidy" }, h.deps)
    writeFileSync(path.join(worktree(), "notes.md"), "agent\n")
    appendFileSync(logOf(), event({ type: "result", subtype: "success", is_error: false }))
    h.state.alive = false
    await h.check()
    return h
  }

  it("keep refuses while the copy holds edits the card hasn't counted, then keeps all of them", async () => {
    const { deps } = await settled()
    // A person's Take over edits whose commit never happened (the app quit while they drove).
    writeFileSync(path.join(worktree(), "mine.md"), "the person's edit\n")
    const first = await keepRunImpl("acme", ID, deps)
    expect(first).toMatchObject({ ok: false })
    expect((await record()).changedFiles).toBe(2)
    expect(await keepRunImpl("acme", ID, deps)).toMatchObject({ ok: true })
    expect(git(repo, "show", "HEAD:mine.md")).toBe("the person's edit\n")
  })

  it("discard refuses while the copy holds edits its confirm didn't name", async () => {
    const { deps } = await settled()
    writeFileSync(path.join(worktree(), "mine.md"), "the person's edit\n")
    expect(await discardRunImpl("acme", ID, deps)).toMatchObject({ ok: false })
    expect(existsSync(path.join(worktree(), "mine.md"))).toBe(true)
  })

  it("the card's changes include edits nobody had committed yet", async () => {
    const { deps } = await settled()
    writeFileSync(path.join(worktree(), "mine.md"), "x\n")
    expect((await runChangesImpl("acme", ID, deps))!.files.map((f) => f.path)).toContain("mine.md")
  })

  it("won't take over or send back a run whose agent wrote ignored AI settings", async () => {
    writeFileSync(path.join(repo, ".gitignore"), ".claude/settings.local.json\n")
    git(repo, "add", "-A")
    git(repo, "commit", "-qm", "ignore local settings")
    const { deps } = await settled()
    mkdirSync(path.join(worktree(), ".claude"), { recursive: true })
    writeFileSync(path.join(worktree(), ".claude", "settings.local.json"), '{"hooks":{}}\n')
    const opened: unknown[] = []
    const open = (async (o: unknown) => (opened.push(o), { id: "x", label: "x" })) as unknown as Parameters<typeof takeOverImpl>[3]
    expect(await takeOverImpl("acme", ID, deps, open)).toMatchObject({ ok: false })
    expect(await askForChangesImpl("acme", ID, "more", deps)).toMatchObject({ ok: false })
    expect(opened).toEqual([])
  })

  it("after a take over that switched the copy to another branch, the run says so instead of looking finished", async () => {
    const { deps } = await settled()
    const calls: { onExit?: () => void }[] = []
    const open = (async (o: { onExit?: () => void }) => (calls.push(o), { id: "t", label: "You · Tidy" })) as unknown as Parameters<typeof takeOverImpl>[3]
    await takeOverImpl("acme", ID, deps, open)
    git(worktree(), "checkout", "-q", "-b", "elsewhere")
    calls[0].onExit!()
    for (let i = 0; i < 250 && (await record()).reason === null; i++) await new Promise((r) => setTimeout(r, 20))
    expect((await record()).reason).toContain("branch")
  })
})

describe("polish", () => {
  beforeEach(() => _resetReconcileForTest())

  it("a run's tab is named by its task alone — the icon already says it's an agent", async () => {
    const { deps } = harness()
    expect(await startRunImpl("acme", { task: "x", title: "Tidy pricing" }, deps)).toMatchObject({ label: "Tidy pricing" })
  })

  it("shows a sentence instead of a diff for a file too large or not text", async () => {
    writeFileSync(path.join(repo, "big.md"), "x".repeat(190_000))
    git(repo, "add", "-A")
    git(repo, "commit", "-q", "-m", "big")
    const h = harness()
    await startRunImpl("acme", { task: "x" }, h.deps)
    // Grew past the cap: the old side is still small enough to read, and must
    // not be shown as if the agent deleted it.
    appendFileSync(path.join(worktree(), "big.md"), "y".repeat(20_000))
    writeFileSync(path.join(worktree(), "logo.bin"), Buffer.from([0, 1, 2, 0, 3]))
    appendFileSync(logOf(), event({ type: "result", subtype: "success", is_error: false }))
    h.state.alive = false
    await h.check()
    expect(await runFileDiffImpl("acme", ID, "big.md", h.deps)).toEqual({ before: "", after: "", notice: "This file is too large to show here." })
    expect(await runFileDiffImpl("acme", ID, "logo.bin", h.deps)).toEqual({
      before: "",
      after: "",
      notice: "This file isn't text, so it can't be shown here.",
    })
  })

  it("work the person committed while they had taken over counts as the run's changes", async () => {
    const h = harness()
    await startRunImpl("acme", { task: "x" }, h.deps)
    appendFileSync(logOf(), event({ type: "result", subtype: "success", is_error: false }))
    h.state.alive = false
    await h.check()
    expect(await record()).toMatchObject({ status: "no-changes", changedFiles: 0 })
    const calls: { onExit?: () => void }[] = []
    const open = (async (o: { onExit?: () => void }) => (calls.push(o), { id: "t", label: "t" })) as unknown as Parameters<typeof takeOverImpl>[3]
    await takeOverImpl("acme", ID, h.deps, open)
    writeFileSync(path.join(worktree(), "mine.md"), "mine\n")
    git(worktree(), "add", "-A")
    git(worktree(), "commit", "-q", "-m", "mine")
    calls[0].onExit!()
    for (let i = 0; i < 250 && (await listRunsImpl("acme", h.deps))[0].driving; i++) await new Promise((r) => setTimeout(r, 20))
    expect(await record()).toMatchObject({ status: "needs-review", changedFiles: 1 })
  })

  it("taking over a stopped run and changing nothing keeps why it stopped", async () => {
    const h = harness()
    await startRunImpl("acme", { task: "x" }, h.deps)
    writeFileSync(path.join(worktree(), "notes.md"), "partial\n")
    h.state.now += RUN_TIME_LIMIT_MS + 1
    await h.check()
    h.state.alive = false
    await h.check()
    const calls: { onExit?: () => void }[] = []
    const open = (async (o: { onExit?: () => void }) => (calls.push(o), { id: "t", label: "t" })) as unknown as Parameters<typeof takeOverImpl>[3]
    h.state.alive = true
    await takeOverImpl("acme", ID, h.deps, open)
    calls[0].onExit!()
    for (let i = 0; i < 250 && (await listRunsImpl("acme", h.deps))[0].driving; i++) await new Promise((r) => setTimeout(r, 20))
    expect(await record()).toMatchObject({ status: "failed", reason: "Took longer than an hour, so it was stopped." })
  })
})
