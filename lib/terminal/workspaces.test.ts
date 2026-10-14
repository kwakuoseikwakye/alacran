import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { createWorkspace, deleteWorkspace, listWorkspaces, updateWorkspace } from "./workspaces"
import { DEFAULT_WORKSPACE_ID, MAX_WORKSPACES_PER_COMPANY, MAX_WORKSPACE_NAME } from "./workspace-model"

let dir: string
let file: string

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "alacran-workspaces-"))
  file = path.join(dir, "terminal-workspaces.json")
})
afterEach(() => rm(dir, { recursive: true, force: true }))

describe("workspaces", () => {
  it("gives every company a Main workspace before anything is stored", async () => {
    expect(await listWorkspaces("acme", file)).toEqual([{ id: DEFAULT_WORKSPACE_ID, name: "Main" }])
  })

  it("creates a workspace that survives a fresh read, per company", async () => {
    const made = await createWorkspace("acme", { name: "  Research  ", executorId: "kiro" }, file)
    expect(made.ok).toBe(true)
    const list = await listWorkspaces("acme", file)
    expect(list.map((w) => w.name)).toEqual(["Main", "Research"])
    expect(list[1]).toMatchObject({ name: "Research", executorId: "kiro" })
    expect(await listWorkspaces("other", file)).toHaveLength(1)
  })

  it("follows the company's AI when none is chosen", async () => {
    const made = await createWorkspace("acme", { name: "Notes", executorId: "" }, file)
    expect(made.ok && made.workspace.executorId).toBeUndefined()
  })

  it("refuses an AI that is not registered, and a name that is empty or too long", async () => {
    expect((await createWorkspace("acme", { name: "x", executorId: "nope" }, file)).ok).toBe(false)
    expect((await createWorkspace("acme", { name: "   " }, file)).ok).toBe(false)
    expect((await createWorkspace("acme", { name: "x".repeat(MAX_WORKSPACE_NAME + 1) }, file)).ok).toBe(false)
    expect(await listWorkspaces("acme", file)).toHaveLength(1)
  })

  it("stops at the cap", async () => {
    for (let i = 1; i < MAX_WORKSPACES_PER_COMPANY; i++) {
      expect((await createWorkspace("acme", { name: `w${i}` }, file)).ok).toBe(true)
    }
    expect((await createWorkspace("acme", { name: "one too many" }, file)).ok).toBe(false)
  })

  it("renames any workspace, Main included, and keeps its AI when none is given", async () => {
    const made = await createWorkspace("acme", { name: "Old", executorId: "kimi" }, file)
    if (!made.ok) throw new Error("setup")
    expect((await updateWorkspace("acme", made.workspace.id, { name: "New" }, file)).ok).toBe(true)
    expect((await updateWorkspace("acme", DEFAULT_WORKSPACE_ID, { name: "Daily" }, file)).ok).toBe(true)
    const list = await listWorkspaces("acme", file)
    expect(list.map((w) => w.name)).toEqual(["Daily", "New"])
    expect(list[1].executorId).toBe("kimi")
    expect((await updateWorkspace("acme", "missing", { name: "x" }, file)).ok).toBe(false)
    expect((await updateWorkspace("acme", made.workspace.id, { name: "" }, file)).ok).toBe(false)
  })

  it("changes a workspace's AI, or returns it to the company's with an empty one", async () => {
    const made = await createWorkspace("acme", { name: "Work", executorId: "kimi" }, file)
    if (!made.ok) throw new Error("setup")
    const id = made.workspace.id
    expect((await updateWorkspace("acme", id, { name: "Work", executorId: "kiro" }, file)).ok).toBe(true)
    expect((await listWorkspaces("acme", file))[1].executorId).toBe("kiro")
    expect((await updateWorkspace("acme", id, { name: "Work", executorId: "" }, file)).ok).toBe(true)
    expect((await listWorkspaces("acme", file))[1].executorId).toBeUndefined()
    // A refused AI leaves the stored one alone.
    await updateWorkspace("acme", id, { name: "Work", executorId: "codex" }, file)
    expect((await updateWorkspace("acme", id, { name: "Work", executorId: "nope" }, file)).ok).toBe(false)
    expect((await listWorkspaces("acme", file))[1].executorId).toBe("codex")
  })

  it("gives Main no AI of its own: it is the company's", async () => {
    await updateWorkspace("acme", DEFAULT_WORKSPACE_ID, { name: "Main", executorId: "kimi" }, file)
    expect((await listWorkspaces("acme", file))[0].executorId).toBeUndefined()
  })

  it("deletes a workspace but never Main", async () => {
    const made = await createWorkspace("acme", { name: "Temp" }, file)
    if (!made.ok) throw new Error("setup")
    expect((await deleteWorkspace("acme", DEFAULT_WORKSPACE_ID, file)).ok).toBe(false)
    expect((await deleteWorkspace("acme", made.workspace.id, file)).ok).toBe(true)
    expect(await listWorkspaces("acme", file)).toHaveLength(1)
    expect((await deleteWorkspace("acme", made.workspace.id, file)).ok).toBe(false)
  })

  it("reads a damaged or foreign file as empty rather than throwing", async () => {
    await writeFile(file, "{not json", "utf-8")
    expect(await listWorkspaces("acme", file)).toHaveLength(1)
    await writeFile(file, JSON.stringify({ acme: [{ id: 5 }, "x", null, { id: "ok", name: "Fine" }] }), "utf-8")
    expect((await listWorkspaces("acme", file)).map((w) => w.name)).toEqual(["Main", "Fine"])
  })
})
