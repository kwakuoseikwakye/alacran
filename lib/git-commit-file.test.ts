import { describe, it, expect } from "vitest"
import { commitFile, gitCommitFile, FALLBACK_COMMIT_EMAIL, FALLBACK_COMMIT_NAME } from "./git-commit-file"
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

describe("committing on a machine with no git identity", () => {
  /** git's own refusal, verbatim from a real Ubuntu 24.04 onboarding. */
  const IDENTITY_ERROR =
    "Author identity unknown\n\n*** Please tell me who you are.\n\nfatal: unable to auto-detect email address (got 'parallels@ubuntu-linux-2404.(none)')"

  it("retries as the fallback author, so a fresh Linux install can still commit", async () => {
    const calls: string[][] = []
    const fakeExec: ExecFileFn = async (_command, args) => {
      calls.push(args)
      // No identity configured: the commit and the identity probe both fail.
      if (args.includes("var")) throw new Error("fatal: unable to auto-detect email address")
      if (args.includes("commit") && !args.includes("-c")) throw new Error(IDENTITY_ERROR)
      return { stdout: "", stderr: "" }
    }

    await commitFile("/repo", "file.md", "msg", fakeExec)

    const retried = calls.at(-1)!
    expect(retried).toEqual([
      "-C",
      "/repo",
      "-c",
      `user.name=${FALLBACK_COMMIT_NAME}`,
      "-c",
      `user.email=${FALLBACK_COMMIT_EMAIL}`,
      "commit",
      "-m",
      "msg",
      "--",
      "file.md",
    ])
  })

  it("never overrides an identity the user really has", async () => {
    // The whole point of probing rather than always passing -c: a configured
    // machine must keep authoring commits as its own user.
    const calls: string[][] = []
    const fakeExec: ExecFileFn = async (_command, args) => {
      calls.push(args)
      return { stdout: "", stderr: "" }
    }

    await commitFile("/repo", "file.md", "msg", fakeExec)

    expect(calls.some((args) => args.includes("-c"))).toBe(false)
    // and no wasted probe on the path every healthy machine takes
    expect(calls.some((args) => args.includes("var"))).toBe(false)
    expect(calls).toHaveLength(2)
  })

  it("rethrows the original error when the commit failed for any other reason", async () => {
    // "nothing to commit" is benign and expected by several callers (v61);
    // they must keep seeing THAT error, not an identity retry's.
    const fakeExec: ExecFileFn = async (_command, args) => {
      if (args.includes("commit")) throw new Error("nothing to commit, working tree clean")
      return { stdout: "", stderr: "" } // `git var` succeeds: identity is fine
    }

    await expect(commitFile("/repo", "file.md", "msg", fakeExec)).rejects.toThrow("nothing to commit")
  })
})

describe("gitCommitFile", () => {
  it("wraps commitFile with options object", async () => {
    const calls: { command: string; args: string[] }[] = []
    const fakeExec: ExecFileFn = async (command, args) => {
      calls.push({ command, args })
      return { stdout: "", stderr: "" }
    }

    await gitCommitFile({
      rootPath: "/repo",
      filePaths: ["a.md", "b.md"],
      commitMessage: "chore: update",
      execFn: fakeExec,
    })

    expect(calls).toEqual([
      { command: "git", args: ["-C", "/repo", "add", "--", "a.md", "b.md"] },
      { command: "git", args: ["-C", "/repo", "commit", "-m", "chore: update", "--", "a.md", "b.md"] },
    ])
  })
})

