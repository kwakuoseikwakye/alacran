import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { createLinkImpl, deleteLinkImpl, listLinksImpl, updateLinkScopeImpl } from "./links"
import { DEFAULT_SHARE_SCOPE } from "./model"

let dir: string
let file: string
const known = async () => ["a", "b", "c"]

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "alacran-links-"))
  file = path.join(dir, "company-links.json")
})
afterEach(() => rm(dir, { recursive: true, force: true }))

describe("company links", () => {
  it("starts empty", async () => {
    expect(await listLinksImpl(file)).toEqual([])
  })

  it("creates a one-way link with the default scope and keeps it across reads", async () => {
    const made = await createLinkImpl({ from: "a", to: "b" }, { file, knownIds: known })
    expect(made.ok).toBe(true)
    const list = await listLinksImpl(file)
    expect(list).toHaveLength(1)
    expect(list[0]).toMatchObject({ from: "a", to: "b", scope: DEFAULT_SHARE_SCOPE })
  })

  it("lets two companies share with each other as two separate links", async () => {
    expect((await createLinkImpl({ from: "a", to: "b" }, { file, knownIds: known })).ok).toBe(true)
    expect((await createLinkImpl({ from: "b", to: "a" }, { file, knownIds: known })).ok).toBe(true)
    expect(await listLinksImpl(file)).toHaveLength(2)
  })

  it("refuses itself, a duplicate, an unknown company, and a scope with nothing on", async () => {
    expect((await createLinkImpl({ from: "a", to: "a" }, { file, knownIds: known })).ok).toBe(false)
    expect((await createLinkImpl({ from: "a", to: "zzz" }, { file, knownIds: known })).ok).toBe(false)
    expect((await createLinkImpl({ from: "zzz", to: "a" }, { file, knownIds: known })).ok).toBe(false)
    expect(
      (await createLinkImpl({ from: "a", to: "b", scope: { summary: false, decisions: false, definitions: false } }, { file, knownIds: known })).ok
    ).toBe(false)
    await createLinkImpl({ from: "a", to: "b" }, { file, knownIds: known })
    expect((await createLinkImpl({ from: "a", to: "b" }, { file, knownIds: known })).ok).toBe(false)
    expect(await listLinksImpl(file)).toHaveLength(1)
  })

  it("narrows a link's scope and refuses to narrow it to nothing", async () => {
    const made = await createLinkImpl({ from: "a", to: "b" }, { file, knownIds: known })
    if (!made.ok) throw new Error("setup")
    expect((await updateLinkScopeImpl(made.link.id, { summary: true, decisions: false, definitions: false }, file)).ok).toBe(true)
    expect((await listLinksImpl(file))[0].scope).toEqual({ summary: true, decisions: false, definitions: false })
    expect((await updateLinkScopeImpl(made.link.id, { summary: false, decisions: false, definitions: false }, file)).ok).toBe(false)
    expect((await updateLinkScopeImpl("missing", DEFAULT_SHARE_SCOPE, file)).ok).toBe(false)
  })

  it("cuts a link", async () => {
    const made = await createLinkImpl({ from: "a", to: "b" }, { file, knownIds: known })
    if (!made.ok) throw new Error("setup")
    expect((await deleteLinkImpl(made.link.id, file)).ok).toBe(true)
    expect(await listLinksImpl(file)).toEqual([])
    expect((await deleteLinkImpl(made.link.id, file)).ok).toBe(false)
  })

  it("reads a damaged or foreign file as empty, and drops entries it cannot trust", async () => {
    await writeFile(file, "{not json", "utf-8")
    expect(await listLinksImpl(file)).toEqual([])
    await writeFile(
      file,
      JSON.stringify([
        { id: "x", from: "a", to: "b", scope: { summary: true }, createdAt: "2026-10-02T00:00:00Z" },
        { id: 5 },
        "nope",
        { id: "y", from: "a", to: "a", scope: { summary: true }, createdAt: "t" },
        { id: "z", from: "a", to: "b", scope: { summary: false }, createdAt: "t" },
      ]),
      "utf-8"
    )
    const list = await listLinksImpl(file)
    expect(list.map((l) => l.id)).toEqual(["x"])
    // Only what was switched on stays on: the missing switches are off, not default-on.
    expect(list[0].scope).toEqual({ summary: true, decisions: false, definitions: false })
  })
})
