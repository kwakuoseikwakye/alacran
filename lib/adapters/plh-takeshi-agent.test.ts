import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { plhTakeshiAgentAdapter } from "./plh-takeshi-agent"
import type { Agent } from "./types"

let root: string
let agent: Agent

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
})
