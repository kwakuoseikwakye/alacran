import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, writeFile, mkdir, rm, chmod } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { plhOpsAdapter } from "./plh-ops"
import type { Agent } from "./types"

let root: string
let agent: Agent

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "plh-ops-test-"))
  agent = { id: "plh-ops", name: "PLH Ops", rootPath: root, kind: "report-log" }
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("plhOpsAdapter", () => {
  it("reads one activity per daily report file, deriving the timestamp from the filename", async () => {
    await mkdir(path.join(root, "reports", "Nana"), { recursive: true })
    await writeFile(path.join(root, "reports", "Nana", "2026-07-08.md"), "# Shipped the AI-Native reorg\n")

    const activities = await plhOpsAdapter(agent)

    expect(activities).toHaveLength(1)
    expect(activities[0]).toMatchObject({
      id: "Nana/2026-07-08",
      type: "daily-report",
      status: "done",
      title: "Nana: Shipped the AI-Native reorg",
      timestamp: Math.floor(new Date("2026-07-08T00:00:00Z").getTime() / 1000),
    })
  })

  it("ignores files that don't match the YYYY-MM-DD.md pattern", async () => {
    await mkdir(path.join(root, "reports", "Nana"), { recursive: true })
    await writeFile(path.join(root, "reports", "Nana", "README.md"), "# Notes\n")

    const activities = await plhOpsAdapter(agent)

    expect(activities).toEqual([])
  })

  it("returns no activities when the reports directory doesn't exist", async () => {
    const activities = await plhOpsAdapter(agent)
    expect(activities).toEqual([])
  })

  it("skips unreadable files and continues with others (per-file isolation)", async () => {
    await mkdir(path.join(root, "reports", "Nana"), { recursive: true })
    const goodFile = path.join(root, "reports", "Nana", "2026-07-08.md")
    const badFile = path.join(root, "reports", "Nana", "2026-07-09.md")

    await writeFile(goodFile, "# Good report\n")
    await writeFile(badFile, "# Bad report\n")

    // Make the second file unreadable
    await chmod(badFile, 0o000)

    try {
      const activities = await plhOpsAdapter(agent)

      // Should still get the good file
      expect(activities).toHaveLength(1)
      expect(activities[0]).toMatchObject({
        id: "Nana/2026-07-08",
        title: "Nana: Good report",
      })
    } finally {
      // Restore permissions so cleanup can work
      await chmod(badFile, 0o644)
    }
  })
})
