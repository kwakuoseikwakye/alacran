import { describe, it, expect } from "vitest"
import { genericGitLogActivityAdapter } from "./generic-git-log"
import type { Agent } from "./types"
import type { ExecFileFn } from "../git-commit-file"

const AGENT: Agent = { id: "second-co", name: "Second Co", rootPath: "/fake/root", kind: "command-set" }

const RECORD_SEP = "\x1e"
const FIELD_SEP = "\x1f"

describe("genericGitLogActivityAdapter", () => {
  it("converts git log output into activities", async () => {
    const fakeExec: ExecFileFn = async (_command, args) => {
      expect(args).toEqual(["-C", "/fake/root", "log", expect.stringMatching(/^--format=/), "-20"])
      return {
        stdout: [
          `abc123${FIELD_SEP}2026-07-23T10:00:00+09:00${FIELD_SEP}Fix the thing${RECORD_SEP}`,
          `def456${FIELD_SEP}2026-07-22T09:00:00+09:00${FIELD_SEP}Add the other thing${RECORD_SEP}`,
        ].join(""),
        stderr: "",
      }
    }

    const activities = await genericGitLogActivityAdapter(AGENT, fakeExec)

    expect(activities).toEqual([
      {
        id: "abc123",
        agentId: "second-co",
        type: "commit",
        timestamp: Math.floor(new Date("2026-07-23T10:00:00+09:00").getTime() / 1000),
        title: "Fix the thing",
        status: "done",
        detailPath: "/fake/root",
      },
      {
        id: "def456",
        agentId: "second-co",
        type: "commit",
        timestamp: Math.floor(new Date("2026-07-22T09:00:00+09:00").getTime() / 1000),
        title: "Add the other thing",
        status: "done",
        detailPath: "/fake/root",
      },
    ])
  })

  it("returns an empty list when git log fails (e.g. no commits yet)", async () => {
    const fakeExec: ExecFileFn = async () => {
      throw new Error("does not have any commits yet")
    }

    const activities = await genericGitLogActivityAdapter(AGENT, fakeExec)

    expect(activities).toEqual([])
  })
})
