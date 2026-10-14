import { describe, it, expect } from "vitest"
import { genericGitLogActivityAdapter } from "./generic-git-log"
import { INITIAL_COMMIT_MESSAGE } from "../company-template-manifest"
import type { Agent } from "./types"
import type { ExecFileFn } from "../git-commit-file"

const AGENT: Agent = { id: "new-co", name: "New Co", rootPath: "/fake/root", kind: "command-set" }

const RECORD_SEP = "\x1e"
const FIELD_SEP = "\x1f"
const line = (sha: string, subject: string) => `${sha}${FIELD_SEP}2026-09-29T09:00:00+09:00${FIELD_SEP}${subject}${RECORD_SEP}`
const execWith =
  (...lines: string[]): ExecFileFn =>
  async () => ({ stdout: lines.join(""), stderr: "" })

describe("genericGitLogActivityAdapter and the scaffold commit", () => {
  it("does not report the scaffold's own commit as something that happened", async () => {
    const activities = await genericGitLogActivityAdapter(AGENT, execWith(line("aaa", INITIAL_COMMIT_MESSAGE)))
    expect(activities).toEqual([])
  })

  it("keeps every other commit, including one that only mentions the scaffold sentence", async () => {
    const activities = await genericGitLogActivityAdapter(
      AGENT,
      execWith(
        line("bbb", "Save your weekly summary"),
        line("ccc", `${INITIAL_COMMIT_MESSAGE} (re-run)`),
        line("aaa", INITIAL_COMMIT_MESSAGE)
      )
    )
    expect(activities.map((a) => a.title)).toEqual(["Save your weekly summary", `${INITIAL_COMMIT_MESSAGE} (re-run)`])
  })
})
