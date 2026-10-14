import { describe, expect, it } from "vitest"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { getSessionNoteStatus, setSessionNoteStatus } from "./session-note-status"

async function scratch(): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "alacran-note-status-"))
  return path.join(dir, "session-note-status.json")
}

describe("session note status", () => {
  it("round-trips one company's outcome without touching another's", async () => {
    const file = await scratch()
    try {
      await setSessionNoteStatus("a", { at: "2026-09-02T10:00:00.000Z", started: true, message: "Writing up." }, file)
      await setSessionNoteStatus("b", { at: "2026-09-02T11:00:00.000Z", started: false, message: "Nope." }, file)
      expect((await getSessionNoteStatus("a", file))?.message).toBe("Writing up.")
      expect((await getSessionNoteStatus("b", file))?.started).toBe(false)
    } finally {
      await rm(path.dirname(file), { recursive: true, force: true })
    }
  })

  it("reports nothing for a company that has never tried", async () => {
    const file = await scratch()
    try {
      expect(await getSessionNoteStatus("never", file)).toBeNull()
    } finally {
      await rm(path.dirname(file), { recursive: true, force: true })
    }
  })

  /** Read straight into the UI, so a half-written or foreign record must show
   *  nothing rather than "undefined". Same tolerance every registry here has. */
  it("shows nothing rather than garbage for an unreadable or malformed file", async () => {
    const file = await scratch()
    try {
      expect(await getSessionNoteStatus("a", file)).toBeNull()
      await writeFile(file, "{not json", "utf-8")
      expect(await getSessionNoteStatus("a", file)).toBeNull()
      await writeFile(file, JSON.stringify([1, 2, 3]), "utf-8")
      expect(await getSessionNoteStatus("a", file)).toBeNull()
      await writeFile(file, JSON.stringify({ a: { started: true } }), "utf-8")
      expect(await getSessionNoteStatus("a", file)).toBeNull()
    } finally {
      await rm(path.dirname(file), { recursive: true, force: true })
    }
  })
})
