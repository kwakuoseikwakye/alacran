import { describe, it, expect, vi } from "vitest"
import { readComms } from "./read"

const listFn = vi.fn(async (dir: string) => {
  if (dir.endsWith("messages")) return ["2026-09-08.md", "2026-09-07.md"]
  if (dir.endsWith("email-checks")) return ["2026-09-08-inbox.md"]
  if (dir.endsWith("notion-checks")) return []
  return []
})

describe("readComms", () => {
  it("tags each entry with its source lane", async () => {
    const entries = await readComms("/co", listFn)
    expect(entries.filter((e) => e.source === "messages")).toHaveLength(2)
    expect(entries.filter((e) => e.source === "email")).toHaveLength(1)
    expect(entries.filter((e) => e.source === "notion")).toHaveLength(0)
  })

  it("sorts newest first across every lane", async () => {
    const entries = await readComms("/co", listFn)
    expect(entries.map((e) => e.date)).toEqual(["2026-09-08", "2026-09-08", "2026-09-07"])
  })

  it("derives the date from the filename prefix", async () => {
    const entries = await readComms("/co", listFn)
    expect(entries[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it("ignores a file whose name carries no date", async () => {
    const noisy = vi.fn(async (dir: string) =>
      dir.endsWith("messages") ? ["README.md", "2026-09-08.md"] : []
    )
    const entries = await readComms("/co", noisy)
    expect(entries).toHaveLength(1)
  })

  it("returns an empty feed when no sweep directory exists", async () => {
    const missing = vi.fn(async () => {
      throw Object.assign(new Error("no"), { code: "ENOENT" })
    })
    await expect(readComms("/co", missing)).resolves.toEqual([])
  })
})
