import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, mkdir, writeFile, utimes } from "node:fs/promises"
import { rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { claudeProjectDir, lastConversation } from "./last-conversation"

let home: string
let root: string

async function transcript(name: string, lines: object[], mtime = new Date()) {
  const dir = claudeProjectDir(root, home)
  await mkdir(dir, { recursive: true })
  const f = path.join(dir, name)
  await writeFile(f, lines.map((l) => JSON.stringify(l) + "\n").join(""))
  await utimes(f, mtime, mtime)
}

beforeEach(async () => {
  home = await mkdtemp(path.join(os.tmpdir(), "alacran-home-"))
  root = await mkdtemp(path.join(os.tmpdir(), "alacran-co-"))
})
afterEach(async () => {
  await rm(home, { recursive: true, force: true })
  await rm(root, { recursive: true, force: true })
})

describe("claudeProjectDir", () => {
  it("slugifies the working directory the way Claude Code stores it", () => {
    expect(claudeProjectDir("/Users/x/AI-Native/acme-ops", "/home")).toBe(
      path.join("/home", ".claude", "projects", "-Users-x-AI-Native-acme-ops")
    )
  })
})

describe("lastConversation", () => {
  it("is null when this company has never been talked to", async () => {
    expect(await lastConversation(root, home)).toBeNull()
  })

  it("treats a missing store as no conversation rather than throwing", async () => {
    expect(await lastConversation("/no/such/company", home)).toBeNull()
  })

  it("reports the newest turn a person typed, and which session it was in", async () => {
    await transcript("a.jsonl", [
      { type: "user", entrypoint: "cli", sessionId: "s-a", timestamp: "2026-08-29T09:00:00Z" },
      { type: "assistant", entrypoint: "cli", sessionId: "s-a", timestamp: "2026-08-29T10:00:00Z" },
    ])
    expect(await lastConversation(root, home)).toMatchObject({
      sessionId: "s-a",
      at: new Date("2026-08-29T10:00:00Z").getTime(),
    })
  })

  it("ignores headless runs and bookkeeping, however recently they touched a file", async () => {
    await transcript("a.jsonl", [{ type: "user", entrypoint: "cli", sessionId: "s-a", timestamp: "2026-08-29T10:00:00Z" }], new Date("2026-08-29T10:00:00Z"))
    await transcript("b.jsonl", [
      { type: "user", entrypoint: "sdk-cli", sessionId: "s-b", timestamp: "2026-09-26T10:00:00Z" },
      { type: "mode", mode: "normal", sessionId: "s-b" },
    ])
    expect((await lastConversation(root, home))?.sessionId).toBe("s-a")
  })
})
