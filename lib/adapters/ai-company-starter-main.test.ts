import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, writeFile, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { aiCompanyStarterMainAdapter } from "./ai-company-starter-main"
import type { Agent } from "./types"

let root: string
let agent: Agent

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "ai-company-test-"))
  agent = { id: "ai-company-starter-main", name: "AI Company Starter", rootPath: root, kind: "command-set" }
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe("aiCompanyStarterMainAdapter", () => {
  it("reads decisions, handoffs, and retros as done activities, skipping README.md", async () => {
    await mkdir(path.join(root, "docs", "decisions"), { recursive: true })
    await mkdir(path.join(root, "docs", "handoffs"), { recursive: true })
    await mkdir(path.join(root, "docs", "retros", "ec-team"), { recursive: true })

    await writeFile(path.join(root, "docs", "decisions", "README.md"), "# Decisions index\n")
    await writeFile(path.join(root, "docs", "decisions", "2026-07-03-boundary.md"), "# Advanced/optional boundary\n")
    await writeFile(path.join(root, "docs", "handoffs", "2026-07.md"), "# July handoff digest\n")
    await writeFile(path.join(root, "docs", "retros", "ec-team", "2026-07-01.md"), "# EC team retro\n")

    const activities = await aiCompanyStarterMainAdapter(agent)

    expect(activities).toHaveLength(3)
    expect(activities.every((a) => a.status === "done")).toBe(true)
    expect(activities.map((a) => a.title).sort()).toEqual([
      "Advanced/optional boundary",
      "EC team retro",
      "July handoff digest",
    ])
    expect(activities.map((a) => a.type).sort()).toEqual(["decision", "handoff", "retro"])
  })

  it("returns no activities when docs directories don't exist", async () => {
    const activities = await aiCompanyStarterMainAdapter(agent)
    expect(activities).toEqual([])
  })

  it("parses well-formed cycle.jsonl lines and skips malformed ones", async () => {
    const cycleDir = path.join(root, "state", "cycles", "ec-team", "2026-07-01")
    await mkdir(cycleDir, { recursive: true })
    await writeFile(
      path.join(cycleDir, "cycle.jsonl"),
      [
        JSON.stringify({ ts: 1700000000, event: "cycle-started" }),
        "not json",
        JSON.stringify({ event: "missing-timestamp" }),
        JSON.stringify({ ts: 1700003600, type: "cycle-closed" }),
      ].join("\n")
    )

    const activities = await aiCompanyStarterMainAdapter(agent)

    expect(activities).toHaveLength(2)
    expect(activities.map((a) => a.title).sort()).toEqual(["cycle-closed", "cycle-started"])
    expect(activities.every((a) => a.type === "cycle-event")).toBe(true)
  })
})
