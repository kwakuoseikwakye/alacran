import { describe, it, expect } from "vitest"
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { saveSessionNoteImpl, prepareSessionNote, SESSION_NOTE_COMMAND_ID } from "./save-session-note-impl"
import type { Agent } from "../adapters/types"

const AGENT: Agent = { id: "acme", name: "Acme", rootPath: "/companies/acme", kind: "command-set" }

function fakeSession(kind = "ai") {
  const written: string[] = []
  return { session: { kind, write: (data: string) => written.push(data) }, written }
}

/** A real company root and a real data dir, because everything under test here
 *  is a filesystem contract with getCompanyCommandResultImpl on the other side. */
async function scratch() {
  const root = await mkdtemp(path.join(tmpdir(), "session-note-root-"))
  const dataRoot = await mkdtemp(path.join(tmpdir(), "session-note-data-"))
  return { root, dataRoot, agent: { ...AGENT, rootPath: root } }
}

describe("saveSessionNoteImpl", () => {
  it("records what the folder looked like first, then asks the live agent to write", async () => {
    const { root, dataRoot, agent } = await scratch()
    try {
      await mkdir(path.join(root, "notes/company/sessions"), { recursive: true })
      await writeFile(path.join(root, "notes/company/sessions/2026-01-01-old.md"), "old", "utf-8")

      const { session, written } = fakeSession()
      const result = await saveSessionNoteImpl(agent, session, dataRoot, "2026-08-28")
      expect(result.ok).toBe(true)

      // The run record is the entire contract with the approval queue.
      const record = JSON.parse(
        await readFile(path.join(dataRoot, agent.id, `${SESSION_NOTE_COMMAND_ID}.run.json`), "utf-8")
      )
      expect(record.commandId).toBe(SESSION_NOTE_COMMAND_ID)
      expect(record.outputKind).toBe("new-file-in-dir")
      expect(record.outputPath).toBe("notes/company/sessions")
      // The file already there must be in `before`, or approving the new note
      // would show the user a file they wrote weeks ago.
      expect(record.before).toEqual(["2026-01-01-old.md"])

      expect(written).toHaveLength(1)
      expect(written[0]).toContain("notes/company/sessions/2026-08-28-")
      // The Enter that submits it. Without this the prompt sits in the agent's
      // input box and nothing happens.
      expect(written[0].endsWith("\n")).toBe(true)
      // The half of the moat that isn't negotiable.
      expect(written[0]).toMatch(/don't commit/i)
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(dataRoot, { recursive: true, force: true })
    }
  })

  it("treats a missing output folder as empty rather than failing", async () => {
    const { root, dataRoot, agent } = await scratch()
    try {
      const { session, written } = fakeSession()
      const result = await saveSessionNoteImpl(agent, session, dataRoot, "2026-08-28")
      expect(result.ok).toBe(true)
      const record = JSON.parse(
        await readFile(path.join(dataRoot, agent.id, `${SESSION_NOTE_COMMAND_ID}.run.json`), "utf-8")
      )
      expect(record.before).toEqual([])
      expect(written).toHaveLength(1)
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(dataRoot, { recursive: true, force: true })
    }
  })

  /**
   * The defect this whole seam is most likely to grow, and it is silent: taking
   * a fresh `before` while an unread note is on disk folds that note INTO the
   * baseline. The result reader then says "No changes produced.", the sidebar
   * dot clears, and a note the user never read is gone from the queue while
   * still sitting in the folder. Same shape v32 records on the prefetch path.
   *
   * **This used to be pinned as a REFUSAL, and the refusal was the bug.** The
   * invariant is the baseline, not the rejection — and refusing put the stop
   * before `setNotedFingerprint`, so the 60-second tick retried and refused
   * forever while its message was discarded by a caller that keeps only
   * `started`. Measured: one unapproved note per company froze every
   * company's memory for three days with nothing anywhere saying so. Keeping
   * the old snapshot protects the unread note just as well, because `before`
   * means "the folder before the notes nobody has approved" and that is the
   * same instant whether one note or three have landed since.
   */
  it("keeps the unread note's baseline instead of re-snapshotting over it", async () => {
    const { root, dataRoot, agent } = await scratch()
    try {
      const { session } = fakeSession()
      await saveSessionNoteImpl(agent, session, dataRoot, "2026-08-28")

      // The agent writes its note.
      await mkdir(path.join(root, "notes/company/sessions"), { recursive: true })
      await writeFile(path.join(root, "notes/company/sessions/2026-08-28-first.md"), "unread", "utf-8")

      const second = fakeSession()
      const result = await saveSessionNoteImpl(agent, second.session, dataRoot, "2026-08-28")
      // Proceeds now — a waiting note must not stop the next one being written.
      expect(result.ok).toBe(true)
      expect(second.written).toHaveLength(1)
      // Told not to clobber the note still waiting, because both notes are
      // named `<today>-<slug>` and two sessions in one day can pick the same
      // few words. This is the one hazard letting the second note through
      // opens, so it is pinned.
      expect(second.written[0]).toMatch(/do not overwrite/i)
      // THE invariant, unchanged: the baseline still predates the first note,
      // so both notes are still in the diff the user has yet to approve.
      const record = JSON.parse(
        await readFile(path.join(dataRoot, agent.id, `${SESSION_NOTE_COMMAND_ID}.run.json`), "utf-8")
      )
      expect(record.before).toEqual([])
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(dataRoot, { recursive: true, force: true })
    }
  })

  it("a run that produced nothing does not block the next one", async () => {
    const { root, dataRoot, agent } = await scratch()
    try {
      const first = fakeSession()
      await saveSessionNoteImpl(agent, first.session, dataRoot, "2026-08-28")
      // The user closed the tab; the agent never wrote anything.
      const second = fakeSession()
      const result = await saveSessionNoteImpl(agent, second.session, dataRoot, "2026-08-28")
      expect(result.ok).toBe(true)
      expect(second.written).toHaveLength(1)
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(dataRoot, { recursive: true, force: true })
    }
  })

  it("refuses a command line tab, which has no assistant to ask", async () => {
    const { root, dataRoot, agent } = await scratch()
    try {
      const { session, written } = fakeSession("shell")
      const result = await saveSessionNoteImpl(agent, session, dataRoot, "2026-08-28")
      expect(result.ok).toBe(false)
      expect(result.message).toMatch(/assistant/i)
      // The real hazard, not just a wrong answer: a prompt typed at a `$` runs
      // as a command line.
      expect(written).toHaveLength(0)
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(dataRoot, { recursive: true, force: true })
    }
  })

  it("refuses a session that has already ended", async () => {
    const { root, dataRoot, agent } = await scratch()
    try {
      const result = await saveSessionNoteImpl(agent, undefined, dataRoot, "2026-08-28")
      expect(result.ok).toBe(false)
      expect(result.message).toMatch(/running/i)
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(dataRoot, { recursive: true, force: true })
    }
  })

  it("refuses an external folder, which has no notes/ to write into", async () => {
    const { root, dataRoot, agent } = await scratch()
    try {
      const { session, written } = fakeSession()
      const result = await saveSessionNoteImpl({ ...agent, kind: "external" }, session, dataRoot, "2026-08-28")
      expect(result.ok).toBe(false)
      expect(written).toHaveLength(0)
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(dataRoot, { recursive: true, force: true })
    }
  })
})

describe("prepareSessionNote mode", () => {
  it("hands the live agent the live prompt by default and the unattended prompt when asked", async () => {
    const { root, dataRoot, agent } = await scratch()
    try {
      const live = await prepareSessionNote(agent, dataRoot, "2026-10-14")
      expect(live.ok && live.prompt).toContain("# source: notes/company/sessions/")
      const unattended = await prepareSessionNote(agent, dataRoot, "2026-10-14", "unattended")
      expect(unattended.ok && unattended.prompt).toContain("## Proposed fact changes")
      expect(unattended.ok && unattended.prompt).not.toContain("# source:")
    } finally {
      await rm(root, { recursive: true, force: true })
      await rm(dataRoot, { recursive: true, force: true })
    }
  })
})
