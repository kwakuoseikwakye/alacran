import { describe, it, expect } from "vitest"
import { commitFile } from "./git-commit-file"
import type { ExecFileFn } from "./git-commit-file"

describe("commitFile", () => {
  it("runs git add then git commit scoped to the exact file", async () => {
    const calls: { command: string; args: string[] }[] = []
    const fakeExec: ExecFileFn = async (command, args) => {
      calls.push({ command, args })
      return { stdout: "", stderr: "" }
    }

    await commitFile("/repo", "skills/piro/SKILL.md", "Edit SKILL.md via AI-Native control panel", fakeExec)

    expect(calls).toEqual([
      { command: "git", args: ["-C", "/repo", "add", "--", "skills/piro/SKILL.md"] },
      {
        command: "git",
        args: [
          "-C",
          "/repo",
          "commit",
          "-m",
          "Edit SKILL.md via AI-Native control panel",
          "--",
          "skills/piro/SKILL.md",
        ],
      },
    ])
  })

  it("propagates an error thrown by the injected exec function", async () => {
    const fakeExec: ExecFileFn = async () => {
      throw new Error("nothing to commit")
    }

    await expect(commitFile("/repo", "file.md", "msg", fakeExec)).rejects.toThrow("nothing to commit")
  })

  it("does not attempt commit if add fails", async () => {
    const calls: string[] = []
    const fakeExec: ExecFileFn = async (command, args) => {
      calls.push(args[2])
      if (args[2] === "add") throw new Error("add failed")
      return { stdout: "", stderr: "" }
    }

    await expect(commitFile("/repo", "file.md", "msg", fakeExec)).rejects.toThrow("add failed")
    expect(calls).toEqual(["add"])
  })
})
