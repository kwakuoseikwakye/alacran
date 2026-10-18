import { describe, expect, it, vi } from "vitest"
import type { CatalogSkill } from "@/lib/os/skills/types"
import { readMemoryGraph } from "./memory-graph-read"

const skill = (id: string, provenance: CatalogSkill["provenance"], filePath: string) =>
  ({ id, name: id, description: `${id} desc`, category: "General", provenance, provenanceLabel: "", filePath, isEditable: false, status: "live" }) as CatalogSkill

// args = ["-C", root, "-c", "core.quotepath=false", <subcommand>, ...]
function fakeGit(opts: { files: string[]; show: Record<string, string>; fail?: boolean }) {
  return vi.fn(async (_command: string, args: string[]) => {
    if (opts.fail) throw new Error("not a git repository")
    if (args[4] === "ls-files") return { stdout: opts.files.join("\n"), stderr: "" }
    if (args[4] === "show") {
      const rel = args[5].replace("HEAD:./", "")
      if (!(rel in opts.show)) throw new Error("bad object")
      return { stdout: opts.show[rel], stderr: "" }
    }
    throw new Error(`unexpected git ${args[4]}`)
  })
}

const SHOW = {
  "notes/a.md": "# Alpha\n\nSee [[b]].\n",
  "notes/b.md": "# Beta\n\nBody.\n",
  "src/x.ts": "export {}",
  ".claude/commands/ship.md": "ship it",
}

describe("readMemoryGraph", () => {
  it("lists tracked files with git ls-files and reads HEAD content, not the working tree", async () => {
    const execFn = fakeGit({ files: ["notes/a.md", "notes/b.md"], show: SHOW })
    const g = await readMemoryGraph("/co", "Co", { execFn, readSkills: async () => [] })
    const calls = execFn.mock.calls.map((c) => c[1].slice(4))
    expect(calls).toContainEqual(expect.arrayContaining(["ls-files"]))
    expect(calls).toContainEqual(["show", "HEAD:./notes/a.md"])
    expect(g.nodes.find((n) => n.id === "notes/a.md")?.label).toBe("Alpha")
    expect(g.edges).toContainEqual(expect.objectContaining({ source: "notes/a.md", target: "notes/b.md" }))
  })

  it("skips files typeOfPath rejects", async () => {
    const execFn = fakeGit({ files: ["notes/a.md", "src/x.ts"], show: SHOW })
    const g = await readMemoryGraph("/co", "Co", { execFn, readSkills: async () => [] })
    expect(g.nodes.map((n) => n.id)).not.toContain("src/x.ts")
    expect(execFn.mock.calls.some((c) => c[1].includes("HEAD:./src/x.ts"))).toBe(false)
  })

  it("skips a listed file that is not committed yet", async () => {
    const execFn = fakeGit({ files: ["notes/a.md", "notes/new.md"], show: SHOW })
    const g = await readMemoryGraph("/co", "Co", { execFn, readSkills: async () => [] })
    expect(g.nodes.map((n) => n.id)).toContain("notes/a.md")
    expect(g.nodes.map((n) => n.id)).not.toContain("notes/new.md")
  })

  it("drops global skills, keeps company ones, and reads skill text from HEAD by root-relative path", async () => {
    const execFn = fakeGit({ files: [], show: SHOW })
    const readSkills = async () => [
      skill("ship", "command", ".claude/commands/ship.md"),
      skill("g", "global", "~/.claude/skills/g/SKILL.md"),
      skill("p", "pack", "/elsewhere/packs/p/SKILL.md"),
    ]
    const g = await readMemoryGraph("/co", "Co", { execFn, readSkills })
    const ids = g.nodes.map((n) => n.id)
    expect(ids).toContain("skill:ship")
    expect(ids).toContain("skill:p")
    expect(ids).not.toContain("skill:g")
    expect(execFn.mock.calls.map((c) => c[1][5])).toContain("HEAD:./.claude/commands/ship.md")
    expect(execFn.mock.calls.some((c) => String(c[1][5]).includes("/elsewhere"))).toBe(false)
  })

  it("makes an absolute skill path under the root relative before git show", async () => {
    const execFn = fakeGit({ files: [], show: { ".claude/commands/ship.md": "x" } })
    await readMemoryGraph("/co", "Co", { execFn, readSkills: async () => [skill("ship", "command", "/co/.claude/commands/ship.md")] })
    expect(execFn.mock.calls.map((c) => c[1][5])).toContain("HEAD:./.claude/commands/ship.md")
  })

  it("git failure gives an empty graph, never throws", async () => {
    const execFn = fakeGit({ files: [], show: {}, fail: true })
    const g = await readMemoryGraph("/co", "Co", { execFn, readSkills: async () => [] })
    expect(g.nodes).toEqual([])
    expect(g.edges).toEqual([])
  })
})
