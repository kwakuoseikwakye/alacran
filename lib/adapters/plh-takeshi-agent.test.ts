import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { plhTakeshiAgentAdapter } from "./plh-takeshi-agent"
import type { Agent } from "./types"

let root: string
let agent: Agent
let throwOnBad456 = false

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>()
  return {
    ...actual,
    readFile: vi.fn(async (filePath, ...args) => {
      if (throwOnBad456 && typeof filePath === "string" && filePath.endsWith("bad456.md")) {
        throw new Error("simulated unreadable file")
      }
      return actual.readFile(filePath as Parameters<typeof actual.readFile>[0], ...args)
    }),
  }
})

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "plh-takeshi-agent-test-"))
  await mkdir(path.join(root, "state"), { recursive: true })
  await mkdir(path.join(root, "reports"), { recursive: true })
  agent = { id: "plh-takeshi-agent", name: "Takeshi Agent", rootPath: root, kind: "pipeline" }
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("plhTakeshiAgentAdapter", () => {
  it("marks an email done when status is done and no attention section", async () => {
    await writeFile(
      path.join(root, "state", "processed.json"),
      JSON.stringify({ processed: { abc123: { attempts: 1, status: "done", ts: 1700000000 } } })
    )
    await writeFile(
      path.join(root, "reports", "20260101-120000-abc123.md"),
      "# All good\n\n## Needs human attention\n\nNone.\n"
    )

    const activities = await plhTakeshiAgentAdapter(agent)

    expect(activities).toHaveLength(1)
    expect(activities[0]).toMatchObject({
      id: "abc123",
      status: "done",
      title: "All good",
      timestamp: 1700000000,
    })
  })

  it("marks an email needs-attention when the report flags something", async () => {
    await writeFile(
      path.join(root, "state", "processed.json"),
      JSON.stringify({ processed: { def456: { attempts: 2, status: "done", ts: 1700000100 } } })
    )
    await writeFile(
      path.join(root, "reports", "20260101-120000-def456.md"),
      "# Needs a fix\n\n## Needs human attention\n\n1. Sandbox blocked git access.\n"
    )

    const activities = await plhTakeshiAgentAdapter(agent)

    expect(activities[0].status).toBe("needs-attention")
  })

  it("marks an email needs-attention when processed status is not done, even without a report", async () => {
    await writeFile(
      path.join(root, "state", "processed.json"),
      JSON.stringify({ processed: { ghi789: { attempts: 3, status: "failed", ts: 1700000200 } } })
    )

    const activities = await plhTakeshiAgentAdapter(agent)

    expect(activities[0]).toMatchObject({ status: "needs-attention", title: "Email ghi789" })
  })

  it("picks the most recent report when multiple reports share an email id", async () => {
    await writeFile(
      path.join(root, "state", "processed.json"),
      JSON.stringify({ processed: { jkl000: { attempts: 2, status: "done", ts: 1700000300 } } })
    )
    await writeFile(
      path.join(root, "reports", "20260101-090000-jkl000.md"),
      "# First attempt\n\n## Needs human attention\n\n1. Old blocker.\n"
    )
    await writeFile(
      path.join(root, "reports", "20260101-150000-jkl000.md"),
      "# Second attempt\n\n## Needs human attention\n\nNone.\n"
    )

    const activities = await plhTakeshiAgentAdapter(agent)

    expect(activities[0]).toMatchObject({ title: "Second attempt", status: "done" })
  })

  it("returns empty array when state/processed.json is missing", async () => {
    // Don't create processed.json file
    const activities = await plhTakeshiAgentAdapter(agent)
    expect(activities).toEqual([])
  })

  it("throws when state/processed.json exists but is corrupt JSON, instead of silently returning empty", async () => {
    await writeFile(path.join(root, "state", "processed.json"), "{ invalid json }")

    await expect(plhTakeshiAgentAdapter(agent)).rejects.toThrow()
  })

  it("gracefully handles a report file that becomes unreadable after readdir lists it", async () => {
    await writeFile(
      path.join(root, "state", "processed.json"),
      JSON.stringify({
        processed: {
          good123: { attempts: 1, status: "done", ts: 1700000400 },
          bad456: { attempts: 1, status: "done", ts: 1700000500 },
        },
      })
    )
    await writeFile(
      path.join(root, "reports", "20260101-120000-good123.md"),
      "# Good email\n\n## Needs human attention\n\nNone.\n"
    )
    // Create bad456 report - readdir will see it, but readFile will fail
    await writeFile(
      path.join(root, "reports", "20260101-120000-bad456.md"),
      "# Bad email\n\n## Needs human attention\n\nNone.\n"
    )

    throwOnBad456 = true
    try {
      const activities = await plhTakeshiAgentAdapter(agent)

      // Should still return activities for both emails
      expect(activities).toHaveLength(2)
      // good123 should have the proper title from report
      expect(activities[0]).toMatchObject({
        id: "good123",
        title: "Good email",
        status: "done",
      })
      // bad456 should fall back to default title and state path
      expect(activities[1]).toMatchObject({
        id: "bad456",
        title: "Email bad456",
        status: "done",
        detailPath: path.join(root, "state", "processed.json"),
      })
    } finally {
      throwOnBad456 = false
    }
  })
})
