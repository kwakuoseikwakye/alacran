import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, mkdir, writeFile, appendFile, utimes, stat, rm, readFile } from "node:fs/promises"
import { writeSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { writeSessionNoteFromLastConversation, catchUpSessionNotes, type SpawnLike } from "./auto-session-note"
import { claudeProjectDir } from "./last-conversation"
import { getNotedFingerprint } from "./noted-conversations"
import { getAiExecutor } from "../ai-executors"
import type { Agent } from "../adapters/types"

let home: string
let root: string
let dataRoot: string
const noted = () => path.join(dataRoot, "noted.json")

const agent = (): Agent =>
  ({ id: "co", name: "Co", rootPath: root, kind: "command-set" }) as Agent

const claude = async () => getAiExecutor("claude-code")

function recordingSpawn() {
  const calls: { command: string; args: string[]; cwd: string }[] = []
  const fn: SpawnLike = (command, args, options) => {
    calls.push({ command, args, cwd: options.cwd })
    return {
      unref: () => {},
      // Fire "exit" synchronously, the way a fast-completing process would.
      // This is what releases the module-level in-flight guard — without it,
      // every test below that spawns would leave agent id "co" stuck in that
      // guard forever, silently short-circuiting every test that runs after.
      on: (event, cb) => {
        if (event === "exit") cb(0 as never)
      },
    }
  }
  return { fn, calls }
}

/** One transcript line the way Claude Code writes it. `cli` is a person in a
 *  terminal; `sdk-cli` is a headless `-p` run, which our own note runs are. */
const turn = (at: Date, sessionId = "s-a", entrypoint = "cli") =>
  JSON.stringify({ type: "user", entrypoint, sessionId, timestamp: at.toISOString() }) + "\n"

/** Claude Code's bookkeeping: no timestamp, no entrypoint, no conversation. */
const bookkeeping = (sessionId: string) => JSON.stringify({ type: "mode", mode: "normal", sessionId }) + "\n"

const OLD = new Date("2026-08-29T10:00:00Z")

// Padded past MIN_NOTE_WORTHY_BYTES by default; pass 0 for a "too short" one.
async function haveConversation(at = OLD, pad = 6_000, file = "a.jsonl", sessionId = "s-a") {
  const dir = claudeProjectDir(root, home)
  await mkdir(dir, { recursive: true })
  const f = path.join(dir, file)
  await writeFile(f, "{}\n".repeat(pad) + turn(at, sessionId))
  await utimes(f, at, at)
  return f
}

beforeEach(async () => {
  home = await mkdtemp(path.join(os.tmpdir(), "alacran-home-"))
  root = await mkdtemp(path.join(os.tmpdir(), "alacran-co-"))
  dataRoot = await mkdtemp(path.join(os.tmpdir(), "alacran-data-"))
})
afterEach(async () => {
  for (const d of [home, root, dataRoot]) await rm(d, { recursive: true, force: true })
})

describe("writeSessionNoteFromLastConversation", () => {
  it("spawns nothing when there is no conversation to write down", async () => {
    const { fn, calls } = recordingSpawn()
    const result = await writeSessionNoteFromLastConversation(agent(), fn, claude, dataRoot, home, undefined, noted())
    expect(result.started).toBe(false)
    expect(calls).toHaveLength(0)
  })

  it("refuses on an executor that cannot resume, without spawning or shelling out", async () => {
    await haveConversation()
    const { fn, calls } = recordingSpawn()
    // Kimi carries no `resume`: not installed on the machine this was verified
    // against, so no flag was invented for it.
    const kimi = async () => getAiExecutor("kimi")
    let ranCli = false
    const noExec = async () => {
      ranCli = true
      return { stdout: "", stderr: "" }
    }
    const result = await writeSessionNoteFromLastConversation(agent(), fn, kimi, dataRoot, home, noExec, noted())
    expect(result.started).toBe(false)
    expect(calls).toHaveLength(0)
    expect(ranCli).toBe(false)
  })

  it("asks once per conversation, not once per tick", async () => {
    await haveConversation()
    const { fn, calls } = recordingSpawn()
    const args = [agent(), fn, claude, dataRoot, home, undefined, noted()] as const
    const first = await writeSessionNoteFromLastConversation(...args)
    expect(first.started).toBe(true)
    // The post-run fingerprint write is fire-and-forget (the spawn is
    // detached; nothing here ever awaits it) — wait for it to actually land
    // on disk rather than racing it.
    await vi.waitFor(async () => {
      expect(await getNotedFingerprint("co", noted())).not.toBeNull()
    })
    const second = await writeSessionNoteFromLastConversation(...args)
    // The ticker runs every 60s forever. Without this the same finished
    // conversation is re-asked on every one of them, unattended, on the
    // user's own AI account.
    expect(second.started).toBe(false)
    expect(calls).toHaveLength(1)
  })

  it("does not re-trigger when the resumed run itself bumps its own transcript's mtime", async () => {
    // The actual bug: `claude --continue` appends its own turn to the same
    // transcript file conversationFingerprint reads, advancing its mtime —
    // as a side effect of the REAL process running, not of anything in this
    // app listening for it. The fake spawn below models that precisely: the
    // mtime bump fires the moment the process "starts," independent of
    // whether an "exit" listener ever gets attached, because the old buggy
    // code registered one for "error" only and never for "exit" — a fake
    // that only bumped mtime from inside an "exit" handler would pass
    // against the old code for the wrong reason (it would never observe the
    // bump at all), which is exactly what an earlier draft of this test did.
    await haveConversation()
    const file = path.join(claudeProjectDir(root, home), "a.jsonl")
    const originalMtime = (await stat(file)).mtimeMs
    let exitCb: ((arg: never) => void) | null = null
    const fn: SpawnLike = () => {
      void appendFile(file, turn(new Date(), "s-a", "sdk-cli")).then(() => exitCb?.(0 as never))
      return {
        unref: () => {},
        on: (event, cb) => {
          if (event === "exit") exitCb = cb
        },
      }
    }
    // An hour-later clock, because this test deliberately bumps the transcript
    // to NOW and the idle guard would otherwise refuse the second call for a
    // reason that has nothing to do with the regression being pinned here.
    // The fingerprint check must remain what refuses it.
    const args = [
      agent(), fn, claude, dataRoot, home, undefined, noted(),
      () => false, () => Date.now() + 3_600_000,
    ] as const
    const first = await writeSessionNoteFromLastConversation(...args)
    expect(first.started).toBe(true)
    // Wait for the simulated run to actually touch the file — a real
    // `--continue` call is not instant either.
    await vi.waitFor(async () => {
      expect((await stat(file)).mtimeMs).toBeGreaterThan(originalMtime)
    })
    // AND for the post-run fingerprint write to land — that write is itself
    // fire-and-forget (nothing here ever awaits it), so a bumped file alone
    // doesn't mean the fix's own bookkeeping has caught up yet.
    await vi.waitFor(async () => {
      expect(await getNotedFingerprint("co", noted())).not.toBeNull()
    })
    const second = await writeSessionNoteFromLastConversation(...args)
    expect(second.started).toBe(false)
  })

  it("leaves a conversation alone while the user is still in it", async () => {
    await haveConversation()
    const { fn, calls } = recordingSpawn()
    const result = await writeSessionNoteFromLastConversation(
      agent(), fn, claude, dataRoot, home, undefined, noted(),
      () => true
    )
    expect(result.started).toBe(false)
    expect(calls).toHaveLength(0)
    // And nothing recorded as noted — the conversation still has to be written
    // up once it actually ends. Marking it here would lose it silently.
    expect(await getNotedFingerprint("co", noted())).toBeNull()
  })

  it("leaves a conversation alone while it is still warm, with no tab of ours open", async () => {
    // A `claude` started from a real terminal is in no session registry, so
    // the transcript's own mtime is the only thing that can say it is live.
    await haveConversation(new Date())
    const { fn, calls } = recordingSpawn()
    const result = await writeSessionNoteFromLastConversation(
      agent(), fn, claude, dataRoot, home, undefined, noted(),
      () => false
    )
    expect(result.started).toBe(false)
    expect(calls).toHaveLength(0)
    expect(await getNotedFingerprint("co", noted())).toBeNull()
  })

  it("writes it up once that conversation has gone quiet", async () => {
    // The guards above are a DELAY, not a veto. Without this, a change that
    // never wrote a note again would pass both of them.
    await haveConversation(new Date())
    const { fn, calls } = recordingSpawn()
    const result = await writeSessionNoteFromLastConversation(
      agent(), fn, claude, dataRoot, home, undefined, noted(),
      () => false, () => Date.now() + 3_600_000
    )
    expect(result.started).toBe(true)
    expect(calls).toHaveLength(1)
  })

  it("refuses for a folder that is not a company", async () => {
    await haveConversation()
    const { fn, calls } = recordingSpawn()
    const external = { ...agent(), kind: "external" } as Agent
    const result = await writeSessionNoteFromLastConversation(external, fn, claude, dataRoot, home, undefined, noted())
    expect(result.started).toBe(false)
    expect(calls).toHaveLength(0)
  })

  it("resumes that exact session first, scoped to the note's own folder", async () => {
    await haveConversation()
    const { fn, calls } = recordingSpawn()
    const result = await writeSessionNoteFromLastConversation(agent(), fn, claude, dataRoot, home, undefined, noted())
    expect(result.started).toBe(true)
    expect(calls).toHaveLength(1)
    const [call] = calls
    expect(call.command).toBe("claude")
    expect(call.cwd).toBe(root)
    // The session a person last typed in, by id: `--continue` means "whichever
    // transcript was touched last", which is how notes landed in days-old ones.
    expect(call.args.slice(0, 2)).toEqual(["--resume", "s-a"])
    const joined = call.args.join(" ")
    expect(joined).toContain("Edit(notes/company/sessions/**)")
    // Widening is per command run; the unattended note never gets a second Edit scope.
    expect(joined.match(/Edit\(/g)).toHaveLength(1)
    // The unattended prompt: it may only write the note, so facts arrive as a
    // section in it for a person to approve, not as edits to company.yaml.
    expect(joined).toContain("## Proposed fact changes")
    expect(joined).not.toContain("# source:")
    expect(joined).toContain("--disallowedTools Bash")
    expect(joined).toContain("--permission-mode manual")
    // Resumed on the cheapest model: the whole transcript is re-read.
    expect(joined).toContain("--model haiku")
  })

  it("does not count Claude Code's bookkeeping writes as a new conversation", async () => {
    // Measured 2026-09-26: Claude Code rewrote mode/cost lines into four
    // transcripts dating back to 09-18, all in the same second, with nobody
    // talking. An mtime fingerprint read each one as new, and a note run
    // followed ten minutes later — 719 of them, hourly, for a week.
    const file = await haveConversation()
    const { fn, calls } = recordingSpawn()
    const args = [agent(), fn, claude, dataRoot, home, undefined, noted(), () => false, () => Date.now() + 3_600_000] as const
    expect((await writeSessionNoteFromLastConversation(...args)).started).toBe(true)
    await vi.waitFor(async () => {
      expect(await getNotedFingerprint("co", noted())).not.toBeNull()
    })
    await appendFile(file, bookkeeping("s-a"))
    await utimes(file, new Date(), new Date())
    expect((await writeSessionNoteFromLastConversation(...args)).started).toBe(false)
    expect(calls).toHaveLength(1)
  })

  it("resumes the conversation a person had, not the transcript touched last", async () => {
    await haveConversation(OLD, 6_000, "a.jsonl", "s-a")
    // Newer on disk, but only headless runs and bookkeeping ever wrote to it.
    const dir = claudeProjectDir(root, home)
    const other = path.join(dir, "b.jsonl")
    await writeFile(other, turn(new Date(), "s-b", "sdk-cli") + bookkeeping("s-b"))
    const { fn, calls } = recordingSpawn()
    const result = await writeSessionNoteFromLastConversation(agent(), fn, claude, dataRoot, home, undefined, noted())
    expect(result.started).toBe(true)
    expect(calls[0].args.slice(0, 2)).toEqual(["--resume", "s-a"])
  })

  it("doesn't resume a conversation too short to be worth a note", async () => {
    await haveConversation(OLD, 0)
    const { fn, calls } = recordingSpawn()
    const result = await writeSessionNoteFromLastConversation(agent(), fn, claude, dataRoot, home, undefined, noted())
    expect(result.started).toBe(false)
    expect(calls).toHaveLength(0)
  })

  it("records a before-snapshot so the note lands in the approval queue", async () => {
    await haveConversation()
    const { fn } = recordingSpawn()
    await writeSessionNoteFromLastConversation(agent(), fn, claude, dataRoot, home, undefined, noted())
    const { readFile } = await import("node:fs/promises")
    const raw = await readFile(path.join(dataRoot, "co", "session-note.run.json"), "utf-8")
    expect(JSON.parse(raw)).toMatchObject({ commandId: "session-note", outputPath: "notes/company/sessions" })
  })

  // Last in this block on purpose: its fake spawn never fires "exit", which
  // leaves agent id "co" stuck in the module-level in-flight guard for the
  // rest of the file's run — harmless here because every test after it (the
  // catchUpSessionNotes block below) uses different agent ids.
  it("refuses a second call for the same company while the first is still running", async () => {
    // No run-lock covers this path the way a real command run has one — a
    // `--continue` on a long conversation can easily outlive one 60s tick, so
    // this in-memory guard is what stops a second concurrent resume of the
    // same conversation before the first one has even finished.
    await haveConversation()
    const fn: SpawnLike = () => ({ unref: () => {}, on: () => {} /* never settles */ })
    const args = [agent(), fn, claude, dataRoot, home, undefined, noted()] as const
    const first = await writeSessionNoteFromLastConversation(...args)
    const second = await writeSessionNoteFromLastConversation(...args)
    expect(first.started).toBe(true)
    expect(second).toEqual({ started: false, quiet: true, message: "Already writing that up." })
  })
})

describe("catchUpSessionNotes", () => {
  /**
   * Collects instead of writing. Without this the default `recordStatus` is
   * the real one, which puts these fake agent ids into the DEVELOPER's own
   * data directory — v75's lesson, hit again by adding a defaulted writer to
   * a function whose tests already passed.
   */
  function recorder() {
    const wrote: { agentId: string; started: boolean; message: string }[] = []
    return {
      wrote,
      record: async (agentId: string, s: { at: string; started: boolean; message: string }) => {
        wrote.push({ agentId, started: s.started, message: s.message })
      },
    }
  }

  it("skips folders that are not companies and counts what it started", async () => {
    const seen: string[] = []
    const agents = [
      { id: "a", name: "A", rootPath: "/a", kind: "command-set" },
      { id: "b", name: "B", rootPath: "/b", kind: "external" },
    ] as Agent[]
    const started = await catchUpSessionNotes(
      async () => agents,
      async (a) => {
        seen.push(a.id)
        return { started: true, message: "" }
      },
      undefined,
      recorder().record
    )
    expect(seen).toEqual(["a"])
    expect(started).toBe(1)
  })

  it("skips a company that has switched session notes off, before any spawn", async () => {
    const seen: string[] = []
    const agents = [
      { id: "on", name: "On", rootPath: "/on", kind: "command-set" },
      { id: "off", name: "Off", rootPath: "/off", kind: "command-set" },
    ] as Agent[]
    const started = await catchUpSessionNotes(
      async () => agents,
      async (a) => {
        seen.push(a.id)
        return { started: true, message: "" }
      },
      async (id) => id !== "off",
      recorder().record
    )
    // "off" must never reach the writer at all — the switch decides whether
    // the app may spend money, so a filter on the result would be too late.
    expect(seen).toEqual(["on"])
    expect(started).toBe(1)
  })

  it("one company's failure does not stop the rest", async () => {
    const agents = [
      { id: "a", name: "A", rootPath: "/a", kind: "command-set" },
      { id: "b", name: "B", rootPath: "/b", kind: "command-set" },
    ] as Agent[]
    const started = await catchUpSessionNotes(
      async () => agents,
      async (a) => {
        if (a.id === "a") throw new Error("boom")
        return { started: true, message: "" }
      },
      undefined,
      recorder().record
    )
    expect(started).toBe(1)
  })

  /**
   * The whole point of the status file. Before it, this function kept only
   * `started` and dropped every message — so a company that could not write
   * its memory down was indistinguishable from one with nothing to say, and
   * that state lasted three days on a real machine across every company.
   */
  it("records a failure the user would otherwise never see, with its reason", async () => {
    const agents = [{ id: "a", name: "A", rootPath: "/a", kind: "command-set" }] as Agent[]
    const r = recorder()
    await catchUpSessionNotes(
      async () => agents,
      async () => ({ started: false, message: "claude isn't installed." }),
      undefined,
      r.record
    )
    expect(r.wrote).toEqual([{ agentId: "a", started: false, message: "claude isn't installed." }])
  })

  it("records a throw's reason too, instead of turning it into an empty string", async () => {
    const agents = [{ id: "a", name: "A", rootPath: "/a", kind: "command-set" }] as Agent[]
    const r = recorder()
    await catchUpSessionNotes(
      async () => agents,
      async () => {
        throw new Error("scope write failed")
      },
      undefined,
      r.record
    )
    expect(r.wrote).toEqual([{ agentId: "a", started: false, message: "scope write failed" }])
  })

  /**
   * "Nothing new to write down" is what almost every tick returns. Recording
   * it would rewrite the file for every company every minute forever and bury
   * the one outcome worth reading.
   */
  it("stays silent about the ordinary nothing-to-do outcomes", async () => {
    const agents = [{ id: "a", name: "A", rootPath: "/a", kind: "command-set" }] as Agent[]
    const r = recorder()
    await catchUpSessionNotes(
      async () => agents,
      async () => ({ started: false, quiet: true, message: "Nothing new to write down." }),
      undefined,
      r.record
    )
    expect(r.wrote).toEqual([])
  })

  it("records a success, so the UI can say when memory was last written", async () => {
    const agents = [{ id: "a", name: "A", rootPath: "/a", kind: "command-set" }] as Agent[]
    const r = recorder()
    await catchUpSessionNotes(
      async () => agents,
      async () => ({ started: true, message: "Writing up the last session." }),
      undefined,
      r.record
    )
    expect(r.wrote).toEqual([{ agentId: "a", started: true, message: "Writing up the last session." }])
  })
})

describe("what an automatic session note costs (v251)", () => {
  // Its own id: the in-flight guard test above leaves "co" held for the rest of this file.
  const costAgent = (): Agent => ({ ...agent(), id: "cost-co" }) as Agent
  const resultLine = JSON.stringify({ type: "result", subtype: "success", is_error: false, total_cost_usd: 0.0123, result: "Wrote the note." }) + "\n"

  /** A run that prints Claude Code's json result into the log fd it was handed, then exits 0. */
  function costSpawn() {
    const calls: string[][] = []
    const fn: SpawnLike = (_command, args, options) => {
      calls.push(args)
      writeSync(options.stdio[1], resultLine)
      return { unref: () => {}, on: (event, cb) => { if (event === "exit") cb(0 as never) } }
    }
    return { fn, calls }
  }

  it("asks Claude Code for its json result on the same resumed session, and records the cost in app data", async () => {
    await haveConversation()
    const { fn, calls } = costSpawn()
    const result = await writeSessionNoteFromLastConversation(costAgent(), fn, claude, dataRoot, home, undefined, noted())
    expect(result.started).toBe(true)
    expect(calls[0].slice(0, 2)).toEqual(["--resume", "s-a"])
    expect(calls[0].join(" ")).toContain("--output-format json")
    await vi.waitFor(async () => {
      const ledger = (await readFile(path.join(dataRoot, "cost-co", "costs.jsonl"), "utf-8")).trim().split("\n").map((l) => JSON.parse(l))
      expect(ledger).toEqual([
        { job: "session-notes", executorId: "claude-code", startedAt: expect.any(String), finishedAt: expect.any(String), costUsd: 0.0123 },
      ])
    })
    // Recorded outside the company folder.
    await expect(stat(path.join(root, "costs.jsonl"))).rejects.toThrow()
  })

  it("does not spawn over the monthly limit, and says why in the status", async () => {
    await haveConversation()
    const { fn, calls } = recordingSpawn()
    const wrote: { started: boolean; message: string }[] = []
    const overCap = async () => ({ blocked: true as const, message: "Not started: this month's limit of $5.00 is reached (about $5.00 so far, estimated). Press Run to start it yourself." })
    const started = await catchUpSessionNotes(
      async () => [costAgent()],
      (a) => writeSessionNoteFromLastConversation(a, fn, claude, dataRoot, home, undefined, noted(), () => false, Date.now, overCap),
      async () => true,
      async (_id, s) => {
        wrote.push({ started: s.started, message: s.message })
      }
    )
    expect(started).toBe(0)
    expect(calls).toHaveLength(0)
    expect(wrote).toEqual([{ started: false, message: expect.stringMatching(/limit/) }])
    // Not stamped as noted, so it is written once the limit lifts.
    expect(await getNotedFingerprint("cost-co", noted())).toBeNull()
  })

  it("reads the limit from the company's definitions by default", async () => {
    await haveConversation()
    await mkdir(path.join(root, "definitions"), { recursive: true })
    await writeFile(path.join(root, "definitions/budget.yaml"), "monthly_limit_usd: 0\n")
    const { fn, calls } = recordingSpawn()
    const result = await writeSessionNoteFromLastConversation(costAgent(), fn, claude, dataRoot, home, undefined, noted())
    expect(result.started).toBe(false)
    expect(result.message).toMatch(/limit of \$0\.00 is reached.*The note is written once the limit lifts\.$/)
    // Session notes have no Run button.
    expect(result.message).not.toMatch(/Press Run/)
    expect(calls).toHaveLength(0)
  })
})

