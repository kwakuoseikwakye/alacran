import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { SHARED_FILE, SHARED_FILE_MARKER, syncSharedKnowledgeFile } from "./shared-file"
import { DEFAULT_SHARE_SCOPE, type ShareLink } from "./model"
import type { Agent } from "../adapters/types"

let root: string
let a: Agent
let b: Agent
let exclude: string
const gitExcludePath = async () => exclude
const link: ShareLink = { id: "l1", from: "a", to: "b", scope: DEFAULT_SHARE_SCOPE, createdAt: "t" }

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "alacran-shared-file-"))
  exclude = path.join(root, "b", ".git", "info", "exclude")
  a = { id: "a", name: "Acme", rootPath: path.join(root, "a"), kind: "command-set" } as Agent
  b = { id: "b", name: "Beta", rootPath: path.join(root, "b"), kind: "command-set" } as Agent
  await mkdir(path.join(a.rootPath, "docs"), { recursive: true })
  await mkdir(b.rootPath, { recursive: true })
  await writeFile(path.join(a.rootPath, "docs", "company-summary.md"), "Acme sells anvils.", "utf-8")
})
afterEach(() => rm(root, { recursive: true, force: true }))

const file = () => path.join(b.rootPath, SHARED_FILE)
const sync = (links: ShareLink[] = [link]) => syncSharedKnowledgeFile(b, links, [a, b], { gitExcludePath })

describe("syncSharedKnowledgeFile", () => {
  it("writes what is shared into state/, marked as generated, with the sharing company named", async () => {
    expect(await sync()).toBe("written")
    const text = await readFile(file(), "utf-8")
    expect(text.startsWith(SHARED_FILE_MARKER)).toBe(true)
    expect(text).toContain("### Shared by Acme")
    expect(text).toContain("Acme sells anvils.")
    expect(text).toContain("--- UNTRUSTED:")
  })

  it("keeps the file out of the company's git through .git/info/exclude, once", async () => {
    await sync()
    await rm(file())
    await sync()
    const lines = (await readFile(exclude, "utf-8")).split("\n").filter(Boolean)
    expect(lines).toEqual([SHARED_FILE])
  })

  it("leaves the file alone when nothing has changed, and rewrites it when the source does", async () => {
    await sync()
    const first = await readFile(file(), "utf-8")
    expect(await sync()).toBe("unchanged")
    expect(await readFile(file(), "utf-8")).toBe(first)

    await writeFile(path.join(a.rootPath, "docs", "company-summary.md"), "Acme now sells rockets.", "utf-8")
    expect(await sync()).toBe("written")
    expect(await readFile(file(), "utf-8")).toContain("Acme now sells rockets.")
  })

  it("removes the file when the string is cut, so sharing stops straight away", async () => {
    await sync()
    expect(await sync([])).toBe("removed")
    await expect(readFile(file(), "utf-8")).rejects.toThrow()
    expect(await sync([])).toBe("unchanged")
  })

  it("never replaces or removes a file the person wrote under that name", async () => {
    await mkdir(path.dirname(file()), { recursive: true })
    await writeFile(file(), "my own notes", "utf-8")
    expect(await sync()).toBe("skipped")
    expect(await sync([])).toBe("unchanged")
    expect(await readFile(file(), "utf-8")).toBe("my own notes")
  })

  it("writes nothing for a company no string points at", async () => {
    expect(await syncSharedKnowledgeFile(a, [link], [a, b], { gitExcludePath })).toBe("unchanged")
    await expect(readFile(path.join(a.rootPath, SHARED_FILE), "utf-8")).rejects.toThrow()
  })

  it("never throws, whatever goes wrong underneath", async () => {
    const result = await syncSharedKnowledgeFile(b, [link], [a, b], {
      gitExcludePath,
      write: async () => {
        throw new Error("disk full")
      },
    })
    expect(result).toBe("skipped")
  })
})
