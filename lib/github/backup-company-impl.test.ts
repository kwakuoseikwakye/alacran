import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import type { ExecFileFn } from "../git-commit-file"

let root: string
let calls: { command: string; args: string[] }[]

function fakeExec(handler: (command: string, args: string[]) => unknown): ExecFileFn {
  return async (command, args) => {
    calls.push({ command, args })
    const result = handler(command, args)
    if (result instanceof Error) throw result
    const r = (result ?? {}) as { stdout?: string; stderr?: string }
    return { stdout: r.stdout ?? "", stderr: r.stderr ?? "" }
  }
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "backup-company-"))
  calls = []
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  vi.resetModules()
})

async function mockAgents() {
  vi.doMock("../config", async (importOriginal) => {
    const actual = await importOriginal<typeof import("../config")>()
    return {
      ...actual,
      AGENTS: [{ id: "acme", name: "Acme Co", rootPath: root, kind: "command-set" }],
    }
  })
}

describe("getCompanyRemoteImpl", () => {
  it("reports no remote for a freshly git-init'd company", async () => {
    await mockAgents()
    const { getCompanyRemoteImpl } = await import("./backup-company-impl")
    const exec = fakeExec(() => new Error("fatal: No such remote 'origin'"))

    expect(await getCompanyRemoteImpl("acme", exec)).toEqual({ ok: true, remoteUrl: null })
  })

  it("reports the remote URL when one is configured", async () => {
    await mockAgents()
    const { getCompanyRemoteImpl } = await import("./backup-company-impl")
    const exec = fakeExec(() => ({ stdout: "git@github.com:me/acme.git\n" }))

    expect(await getCompanyRemoteImpl("acme", exec)).toEqual({
      ok: true,
      remoteUrl: "git@github.com:me/acme.git",
    })
  })

  it("rejects an unknown company", async () => {
    await mockAgents()
    const { getCompanyRemoteImpl } = await import("./backup-company-impl")
    const exec = fakeExec(() => ({ stdout: "" }))

    const result = await getCompanyRemoteImpl("nope", exec)
    expect(result.ok).toBe(false)
  })
})

describe("backupCompanyImpl", () => {
  it("creates a PRIVATE repo from the company directory, then pushes over HTTPS with gh's credential helper", async () => {
    await mockAgents()
    const { backupCompanyImpl } = await import("./backup-company-impl")
    const exec = fakeExec((command, args) => {
      if (command === "git" && args.includes("get-url")) return new Error("no remote")
      return { stdout: "" }
    })

    const result = await backupCompanyImpl("acme", exec)

    expect(result.ok).toBe(true)
    const create = calls.find((c) => c.command === "gh" && c.args[0] === "repo")
    expect(create).toBeDefined()
    // private is non-negotiable: a company repo holds real business context
    expect(create!.args).toContain("--private")
    expect(create!.args).toContain(`--source=${root}`)
    expect(create!.args).not.toContain("--public")
    // Push happens explicitly, after wiring gh's own credential helper —
    // not via `gh repo create --push`, which would push over whatever
    // protocol (possibly SSH) gh's account settings prefer.
    expect(calls.some((c) => c.command === "gh" && c.args.join(" ") === "auth setup-git")).toBe(true)
    const push = calls.find((c) => c.command === "git" && c.args.includes("push"))
    expect(push).toBeDefined()
    expect(push!.args).toEqual(["-C", root, "push", "-u", "origin", "HEAD"])
  })

  it("pushes to the existing remote instead of creating a second repo, forcing HTTPS first", async () => {
    await mockAgents()
    const { backupCompanyImpl } = await import("./backup-company-impl")
    const exec = fakeExec((command, args) => {
      if (command === "git" && args.includes("get-url")) return { stdout: "git@github.com:me/acme.git\n" }
      return { stdout: "" }
    })

    const result = await backupCompanyImpl("acme", exec)

    expect(result.ok).toBe(true)
    expect(calls.some((c) => c.command === "gh" && c.args[0] === "repo")).toBe(false)
    expect(calls.some((c) => c.command === "gh" && c.args.join(" ") === "auth setup-git")).toBe(true)
    // The SSH remote from getCompanyRemoteImpl gets rewritten to HTTPS
    // before the push is attempted.
    const setUrl = calls.find((c) => c.command === "git" && c.args.includes("set-url"))
    expect(setUrl).toBeDefined()
    expect(setUrl!.args).toContain("https://github.com/me/acme.git")
    const push = calls.find((c) => c.command === "git" && c.args.includes("push"))
    expect(push).toBeDefined()
    expect(push!.args).toEqual(["-C", root, "push", "-u", "origin", "HEAD"])
  })

  it("self-heals a stale origin (repo never created) by creating it instead of surfacing git's raw error", async () => {
    await mockAgents()
    const { backupCompanyImpl } = await import("./backup-company-impl")
    let pushAttempts = 0
    const exec = fakeExec((command, args) => {
      if (command === "git" && args.includes("get-url")) return { stdout: "git@github.com:me/acme.git\n" }
      if (command === "git" && args.includes("push")) {
        pushAttempts++
        // First push (against the stale remote) fails; the retry after
        // self-healing succeeds.
        if (pushAttempts === 1) {
          return new Error(
            "fatal: Could not read from remote repository.\n\nPlease make sure you have the correct access rights\nand the repository exists."
          )
        }
        return { stdout: "" }
      }
      if (command === "git" && args.includes("remove")) return { stdout: "" }
      if (command === "gh") return { stdout: "" }
      return { stdout: "" }
    })

    const result = await backupCompanyImpl("acme", exec)

    expect(result.ok).toBe(true)
    expect(calls.some((c) => c.command === "git" && c.args.includes("remove"))).toBe(true)
    const create = calls.find((c) => c.command === "gh" && c.args[0] === "repo")
    expect(create).toBeDefined()
    expect(create!.args).toContain("--private")
    expect(pushAttempts).toBe(2)
  })

  it("does not recreate the repo on an unrelated push failure (network, auth) — surfaces it instead", async () => {
    await mockAgents()
    const { backupCompanyImpl } = await import("./backup-company-impl")
    const exec = fakeExec((command, args) => {
      if (command === "git" && args.includes("get-url")) return { stdout: "git@github.com:me/acme.git\n" }
      if (command === "git" && args.includes("push")) return new Error("fatal: unable to access: network is unreachable")
      return { stdout: "" }
    })

    const result = await backupCompanyImpl("acme", exec)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain("network is unreachable")
    expect(calls.some((c) => c.command === "gh" && c.args[0] === "repo")).toBe(false)
  })

  it("surfaces a failure message instead of throwing", async () => {
    await mockAgents()
    const { backupCompanyImpl } = await import("./backup-company-impl")
    const exec = fakeExec((command, args) => {
      if (command === "git" && args.includes("get-url")) return new Error("no remote")
      if (command === "gh") return new Error("gh: repository already exists")
      return { stdout: "" }
    })

    const result = await backupCompanyImpl("acme", exec)

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain("already exists")
  })
})
