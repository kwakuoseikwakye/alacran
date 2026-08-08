import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { mkdtemp, rm, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { parse } from "yaml"
import type { ExecFileFn } from "./git-commit-file"

let root: string
let execCalls: { command: string; args: string[] }[]

const fakeExecFn: ExecFileFn = async (command, args) => {
  execCalls.push({ command, args })
  return { stdout: "", stderr: "" }
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "save-google-accounts-"))
  execCalls = []
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
  vi.resetModules()
})

async function mockAgents() {
  vi.doMock("./get-effective-agents", () => ({
    getEffectiveAgents: async () => [
      { id: "second-co", name: "Second Co", rootPath: root, kind: "command-set" },
    ],
  }))
}

describe("saveGoogleAccountsImpl", () => {
  it("writes definitions/integrations/google.yaml and commits it", async () => {
    await mockAgents()
    const { saveGoogleAccountsImpl } = await import("./save-google-accounts-impl")

    const result = await saveGoogleAccountsImpl("second-co", ["a@example.com", "b@example.com"], fakeExecFn)

    expect(result).toEqual({ ok: true })
    const written = await readFile(path.join(root, "definitions", "integrations", "google.yaml"), "utf-8")
    expect(parse(written)).toEqual({ accounts: ["a@example.com", "b@example.com"] })
  })

  it("commits the file via the injected exec function, scoped to the one file", async () => {
    await mockAgents()
    const { saveGoogleAccountsImpl } = await import("./save-google-accounts-impl")

    await saveGoogleAccountsImpl("second-co", ["a@example.com"], fakeExecFn)

    const relativePath = path.join("definitions", "integrations", "google.yaml")
    expect(execCalls).toEqual([
      { command: "git", args: ["-C", root, "add", "--", relativePath] },
      {
        command: "git",
        args: [
          "-C",
          root,
          "commit",
          "-m",
          "Update connected Google accounts via AI-Native control panel",
          "--",
          relativePath,
        ],
      },
    ])
  })

  it("fails cleanly for an unknown agent id", async () => {
    await mockAgents()
    const { saveGoogleAccountsImpl } = await import("./save-google-accounts-impl")

    const result = await saveGoogleAccountsImpl("no-such-agent", ["a@example.com"], fakeExecFn)

    expect(result).toEqual({ ok: false, message: "Unknown company" })
    expect(execCalls).toEqual([])
  })

  it("can write an empty list (unassigning back to gog's default account)", async () => {
    await mockAgents()
    const { saveGoogleAccountsImpl } = await import("./save-google-accounts-impl")

    const result = await saveGoogleAccountsImpl("second-co", [], fakeExecFn)

    expect(result).toEqual({ ok: true })
    const written = await readFile(path.join(root, "definitions", "integrations", "google.yaml"), "utf-8")
    expect(parse(written)).toEqual({ accounts: [] })
  })
})
