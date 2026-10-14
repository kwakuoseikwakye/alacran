import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { existsSync } from "node:fs"
import { mkdtemp, mkdir, readFile, stat, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { delegateTaskImpl, DELEGATE_TASK_COMMAND_ID } from "./delegate-task-impl"
import * as registry from "../company-commands/registry"
import type { ExecFileFn } from "../company-commands/repo-changes"
import type { Agent } from "../adapters/types"

const BASE: Agent = { id: "acme", name: "Acme", rootPath: "/companies/acme", kind: "command-set" }
const TODAY = "2026-10-08"

// A real company root and a real data dir, as in save-session-note-impl.test.ts: everything under
// test is a filesystem contract with getCompanyCommandResultImpl, and these are temp dirs so no
// real state is touched (the company root is not a git repo, so the dirty-file listing is null).
let root: string
let dataRoot: string
let agent: Agent

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "delegate-task-root-"))
  dataRoot = await mkdtemp(path.join(tmpdir(), "delegate-task-data-"))
  agent = { ...BASE, rootPath: root }
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  await rm(dataRoot, { recursive: true, force: true })
})

const recordPath = () => path.join(dataRoot, BASE.id, `${DELEGATE_TASK_COMMAND_ID}.run.json`)
const runRecordExists = () =>
  stat(recordPath()).then(
    () => true,
    () => false
  )
const readRunRecord = async () => JSON.parse(await readFile(recordPath(), "utf-8"))

/** A fake `git status --porcelain -z`: each reply is the list of dirty paths for ONE call, in call order. */
function fakeGit(...replies: (string[] | Error)[]): ExecFileFn {
  let call = 0
  return async () => {
    const reply = replies[Math.min(call++, replies.length - 1)]
    if (reply instanceof Error) throw reply
    return { stdout: reply.map((p) => ` M ${p}\0`).join(""), stderr: "" }
  }
}
const ai = () => ({ kind: "ai", write: vi.fn() })
const typedOf = (session: { write: ReturnType<typeof vi.fn> }) => (session.write.mock.calls[0] as unknown[])[0] as string

describe("delegateTaskImpl", () => {
  it("refuses with nothing written when no agent is open", async () => {
    const out = await delegateTaskImpl(agent, "draft the plan", undefined, dataRoot, TODAY)
    expect(out).toEqual({ ok: false, message: expect.stringContaining("isn't open") })
    expect(out.message).toBe("Your agent isn't open for Acme. Open it in Terminal, then send again.")
    expect(await runRecordExists()).toBe(false)
  })

  it("refuses a command-line session without writing", async () => {
    const session = { kind: "shell", write: vi.fn() }
    const out = await delegateTaskImpl(agent, "draft the plan", session, dataRoot, TODAY)
    expect(out.ok).toBe(false)
    expect(session.write).not.toHaveBeenCalled()
    expect(await runRecordExists()).toBe(false)
  })

  it("refuses a run session without writing", async () => {
    const session = { kind: "run", write: vi.fn() }
    expect((await delegateTaskImpl(agent, "draft the plan", session, dataRoot, TODAY)).ok).toBe(false)
    expect(session.write).not.toHaveBeenCalled()
    expect(await runRecordExists()).toBe(false)
  })

  it("refuses a folder that is not a company, with nothing written", async () => {
    const session = { kind: "ai", write: vi.fn() }
    const out = await delegateTaskImpl({ ...agent, kind: "external" }, "draft the plan", session, dataRoot, TODAY)
    expect(out.ok).toBe(false)
    expect(session.write).not.toHaveBeenCalled()
    expect(await runRecordExists()).toBe(false)
  })

  it("refuses an empty or non-string task", async () => {
    const session = { kind: "ai", write: vi.fn() }
    for (const task of ["", "  \n ", 42, undefined]) {
      expect((await delegateTaskImpl(agent, task, session, dataRoot, TODAY)).ok).toBe(false)
    }
    expect(session.write).not.toHaveBeenCalled()
    expect(await runRecordExists()).toBe(false)
  })

  // A leading "!" is a shell command in Claude Code, run with no permission prompt, and a trailing ";"
  // would let the appended "When you finish..." ride along. So it is refused before anything is written.
  describe("a task that starts with a bang", () => {
    const REFUSAL = 'A task can\'t start with "!": your agent would run it as a command line without asking you. Reword it.'
    it.each([
      ["a plain bang", "!ls"],
      ["a bang after spaces", "  !ls"],
      ["a bang after a control character", "\u0001!ls"],
      ["a bang after a newline", "\n!rm -rf docs;"],
    ])("is refused with nothing written or typed for %s", async (_name, task) => {
      const session = ai()
      const out = await delegateTaskImpl(agent, task, session, dataRoot, TODAY)
      expect(out).toEqual({ ok: false, message: REFUSAL })
      expect(session.write).not.toHaveBeenCalled()
      expect(await runRecordExists()).toBe(false)
    })

    it("still allows a bang later in the task", async () => {
      const session = ai()
      const out = await delegateTaskImpl(agent, "Say hi!", session, dataRoot, TODAY)
      expect(out.ok).toBe(true)
      expect(typedOf(session)).toContain("Say hi!")
    })

    it("still sends a task that starts with a slash (the card only warns)", async () => {
      const session = ai()
      expect((await delegateTaskImpl(agent, "/clear", session, dataRoot, TODAY)).ok).toBe(true)
      expect(session.write).toHaveBeenCalledTimes(1)
    })
  })

  it("writes the run record first, then types one sanitised line plus the summary instruction", async () => {
    let recordExistedAtWrite: boolean | undefined
    // Checked synchronously at the moment the keystrokes are typed, not after the fact.
    const session = { kind: "ai", write: vi.fn(() => void (recordExistedAtWrite = existsSync(recordPath()))) }
    const out = await delegateTaskImpl(agent, "Draft the Q4 proposal\u001b[200~\nfor Ana", session, dataRoot, TODAY)
    expect(out.ok).toBe(true)
    expect(session.write).toHaveBeenCalledTimes(1)
    const typed = (session.write.mock.calls[0] as unknown[])[0] as string
    expect(typed.endsWith("\n")).toBe(true)
    const line = typed.slice(0, -1)
    expect(line).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/) // one line: no ESC, no inner newline
    expect(line).toContain("Draft the Q4 proposal")
    expect(line).toContain("for Ana")
    expect(line).toContain("notes/company/tasks/2026-10-08-")
    expect(await runRecordExists()).toBe(true)
    // The record was already on disk when the keystrokes were typed.
    expect(recordExistedAtWrite).toBe(true)

    const record = await readRunRecord()
    expect(record.commandId).toBe(DELEGATE_TASK_COMMAND_ID)
    expect(record.outputKind).toBe("new-file-in-dir")
    expect(record.outputPath).toBe("notes/company/tasks")
    expect(record.before).toEqual([])
  })

  it("keeps the baseline and adds the don't-overwrite line when a previous summary is unapproved", async () => {
    const first = { kind: "ai", write: vi.fn() }
    await delegateTaskImpl(agent, "first task", first, dataRoot, TODAY)
    // The agent finishes the first task and writes its summary; nobody has approved it yet.
    await mkdir(path.join(root, "notes/company/tasks"), { recursive: true })
    await writeFile(path.join(root, "notes/company/tasks/2026-10-08-first.md"), "unread", "utf-8")

    const before = await readRunRecord()
    const session = { kind: "ai", write: vi.fn() }
    const out = await delegateTaskImpl(agent, "second task", session, dataRoot, TODAY)
    expect(out.ok).toBe(true)
    expect(await readRunRecord()).toEqual(before) // not rewritten: the unread summary stays in the diff
    const typed = typedOf(session)
    expect(typed).toContain("Do not overwrite")
    // Still ONE submitted line: no control character at all except the Enter at the very end.
    expect(typed.endsWith("\n")).toBe(true)
    expect(typed.slice(0, -1)).not.toMatch(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/)
  })

  it("does not add the don't-overwrite line when nothing is waiting", async () => {
    const first = { kind: "ai", write: vi.fn() }
    await delegateTaskImpl(agent, "first task", first, dataRoot, TODAY)
    // The first task produced nothing, so the next one is a clean start.
    const session = { kind: "ai", write: vi.fn() }
    await delegateTaskImpl(agent, "second task", session, dataRoot, TODAY)
    expect((session.write.mock.calls[0] as unknown[])[0]).not.toContain("Do not overwrite")
  })

  it("caps a very long task at 4000 characters before it reaches the terminal", async () => {
    const session = { kind: "ai", write: vi.fn() }
    await delegateTaskImpl(agent, "x".repeat(10_000), session, dataRoot, TODAY)
    const typed = (session.write.mock.calls[0] as unknown[])[0] as string
    expect(typed).not.toContain("x".repeat(4001))
    expect(typed).toContain("x".repeat(4000))
  })
  it("never lets a control character from the command text reach the terminal, only the final Enter", async () => {
    const real = registry.getCompanyCommand(DELEGATE_TASK_COMMAND_ID)!
    const spy = vi
      .spyOn(registry, "getCompanyCommand")
      .mockReturnValue({ ...real, buildPrompt: () => "first\tsecond\rthird\u001b[200~ fourth\u2028fifth\u0085sixth" })
    try {
      const session = ai()
      await delegateTaskImpl(agent, "anything", session, dataRoot, TODAY)
      expect(typedOf(session)).toBe("first second third [200~ fourth fifth sixth\n")
    } finally {
      spy.mockRestore()
    }
  })

  it("joins the task and the summary instruction as two sentences on one line", async () => {
    const session = ai()
    await delegateTaskImpl(agent, "Draft the Q4 proposal for Ana", session, dataRoot, TODAY)
    expect(typedOf(session)).toBe(
      "Draft the Q4 proposal for Ana. When you finish, save a short summary of what you did in notes/company/tasks/2026-10-08-<a-few-word-slug>.md.\n"
    )
  })

  describe("which baseline the approval screen diffs against", () => {
    it("keeps the baseline when an earlier task's edits elsewhere are still unreviewed, without claiming a summary is waiting", async () => {
      // Task 1 starts on a clean folder.
      await delegateTaskImpl(agent, "first task", ai(), dataRoot, TODAY, fakeGit([]))
      const rawBefore = await readFile(recordPath(), "utf-8")

      // Task 1's agent has edited a file but written no summary yet; the owner delegates task 2.
      const second = ai()
      const out = await delegateTaskImpl(agent, "second task", second, dataRoot, TODAY, fakeGit(["notes/other.md"]))

      expect(out.ok).toBe(true)
      expect(second.write).toHaveBeenCalledTimes(1)
      // Byte-identical: re-taking it would have folded notes/other.md into "was already dirty" and hidden it.
      expect(await readFile(recordPath(), "utf-8")).toBe(rawBefore)
      expect(typedOf(second)).not.toContain("waiting to be approved")
      expect(typedOf(second)).not.toContain("Do not overwrite")
    })

    it("writes the record when there was none, remembering what was already dirty", async () => {
      const session = ai()
      await delegateTaskImpl(agent, "first task", session, dataRoot, TODAY, fakeGit(["already/dirty.md"]))
      expect(session.write).toHaveBeenCalledTimes(1)
      expect((await readRunRecord()).beforeDirty).toEqual(["already/dirty.md"])
    })

    it("takes a fresh baseline when nothing strayed and no summary is waiting", async () => {
      // Call order: 1) task 1 baseline, 2) task 2 reads strays, 3) task 2 baseline.
      const git = fakeGit(["pre.md"], ["pre.md"], ["pre.md", "later.md"])
      await delegateTaskImpl(agent, "first task", ai(), dataRoot, TODAY, git)
      await delegateTaskImpl(agent, "second task", ai(), dataRoot, TODAY, git)
      expect((await readRunRecord()).beforeDirty).toEqual(["pre.md", "later.md"])
    })

    it("takes a fresh baseline when the earlier check could not tell (unknown is not unreviewed)", async () => {
      // Task 1's git failed, so its record has beforeDirty null and strays can only be unknown.
      await delegateTaskImpl(agent, "first task", ai(), dataRoot, TODAY, fakeGit(new Error("not a git repo")))
      expect((await readRunRecord()).beforeDirty).toBeNull()

      await delegateTaskImpl(agent, "second task", ai(), dataRoot, TODAY, fakeGit(["x.md"]))
      expect((await readRunRecord()).beforeDirty).toEqual(["x.md"])
    })

    it("still keeps the baseline AND adds the don't-overwrite line when a summary is waiting", async () => {
      await delegateTaskImpl(agent, "first task", ai(), dataRoot, TODAY, fakeGit([]))
      const rawBefore = await readFile(recordPath(), "utf-8")
      await mkdir(path.join(root, "notes/company/tasks"), { recursive: true })
      await writeFile(path.join(root, "notes/company/tasks/2026-10-08-first.md"), "unread", "utf-8")

      const second = ai()
      await delegateTaskImpl(agent, "second task", second, dataRoot, TODAY, fakeGit([]))
      expect(await readFile(recordPath(), "utf-8")).toBe(rawBefore)
      expect(typedOf(second)).toContain("waiting to be approved")
      expect(typedOf(second)).toContain("Do not overwrite")
    })
  })

  describe("naming the tab it went to", () => {
    it("says which tab received the task when the session has a label", async () => {
      const session = { kind: "ai", label: "Claude Code", write: vi.fn() }
      const out = await delegateTaskImpl(agent, "draft the plan", session, dataRoot, TODAY)
      expect(out).toEqual({
        ok: true,
        message: "Sent to Claude Code. Watch it in Terminal. When it saves its summary, that appears in Approvals, with a list of any other files it changed.",
      })
    })

    it("falls back to the plain message without a label", async () => {
      const out = await delegateTaskImpl(agent, "draft the plan", ai(), dataRoot, TODAY)
      expect(out).toEqual({
        ok: true,
        message: "Sent. Watch your agent in Terminal. When it saves its summary, that appears in Approvals, with a list of any other files it changed.",
      })
    })
  })
})
