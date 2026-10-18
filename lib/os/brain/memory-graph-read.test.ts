import { beforeEach, describe, expect, it, vi } from "vitest"
import type { CatalogSkill } from "@/lib/os/skills/types"
import { readMemoryGraph, resetMemoryGraphCache } from "./memory-graph-read"

// Delegating mocks with a switch, so one test can make each step throw.
const boom = vi.hoisted(() => ({ text: "", build: false }))
vi.mock("@/lib/os/memory-items", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/os/memory-items")>()
  return {
    ...real,
    readMemoryText: (...a: Parameters<typeof real.readMemoryText>) => {
      if (a[0] === boom.text) throw new Error("unreadable")
      return real.readMemoryText(...a)
    },
  }
})
vi.mock("./memory-graph", async (importOriginal) => {
  const real = await importOriginal<typeof import("./memory-graph")>()
  return {
    ...real,
    buildMemoryGraph: (...a: Parameters<typeof real.buildMemoryGraph>) => {
      if (boom.build) throw new Error("bad graph")
      return real.buildMemoryGraph(...a)
    },
  }
})

const skill = (id: string, provenance: CatalogSkill["provenance"], filePath: string) =>
  ({ id, name: id, description: `${id} desc`, category: "General", provenance, provenanceLabel: "", filePath, isEditable: false, status: "live" }) as CatalogSkill

// args = ["--no-optional-locks", "-C", root, "-c", "core.quotepath=false", <subcommand>, ...]
function fakeGit(opts: { files: string[]; show: Record<string, string>; fail?: boolean }) {
  return vi.fn(async (_command: string, args: string[]) => {
    if (opts.fail) throw new Error("not a git repository")
    if (args[5] === "rev-parse") return { stdout: "abc123\n", stderr: "" }
    if (args[5] === "ls-files") return { stdout: opts.files.join("\n"), stderr: "" }
    if (args[5] === "show") {
      const rel = args[6].replace("HEAD:./", "")
      if (!(rel in opts.show)) throw new Error("bad object")
      return { stdout: opts.show[rel], stderr: "" }
    }
    throw new Error(`unexpected git ${args[5]}`)
  })
}

const SHOW = {
  "notes/a.md": "# Alpha\n\nSee [[b]].\n",
  "notes/b.md": "# Beta\n\nBody.\n",
  "src/x.ts": "export {}",
  ".claude/commands/ship.md": "ship it",
}

describe("readMemoryGraph", () => {
  beforeEach(() => {
    resetMemoryGraphCache()
    boom.text = ""
    boom.build = false
  })

  it("never takes git's optional locks: the page re-renders every 15 seconds", async () => {
    const execFn = fakeGit({ files: ["notes/a.md"], show: SHOW })
    await readMemoryGraph("/co", "Co", { execFn, readSkills: async () => [] })
    for (const [, args] of execFn.mock.calls) expect(args.slice(0, 2)).toEqual(["--no-optional-locks", "-C"])
  })

  it("skips a file whose text can't be read instead of failing the map", async () => {
    boom.text = "notes/b.md"
    const execFn = fakeGit({ files: ["notes/a.md", "notes/b.md"], show: SHOW })
    const g = await readMemoryGraph("/co", "Co", { execFn, readSkills: async () => [] })
    expect(g.nodes.map((n) => n.id)).toContain("notes/a.md")
    expect(g.nodes.map((n) => n.id)).not.toContain("notes/b.md")
  })

  it("gives an empty graph when building it throws", async () => {
    boom.build = true
    const execFn = fakeGit({ files: ["notes/a.md"], show: SHOW })
    const g = await readMemoryGraph("/co", "Co", { execFn, readSkills: async () => [] })
    expect(g.nodes).toEqual([])
    expect(g.counts).toEqual({ alwaysFiles: 0, lookupFiles: 0, unsureFacts: 0 })
  })

  it("lists tracked files with git ls-files and reads HEAD content, not the working tree", async () => {
    const execFn = fakeGit({ files: ["notes/a.md", "notes/b.md"], show: SHOW })
    const g = await readMemoryGraph("/co", "Co", { execFn, readSkills: async () => [] })
    const calls = execFn.mock.calls.map((c) => c[1].slice(5))
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
    expect(execFn.mock.calls.map((c) => c[1][6])).toContain("HEAD:./.claude/commands/ship.md")
    expect(execFn.mock.calls.some((c) => String(c[1][6]).includes("/elsewhere"))).toBe(false)
  })

  it("makes an absolute skill path under the root relative before git show", async () => {
    const execFn = fakeGit({ files: [], show: { ".claude/commands/ship.md": "x" } })
    await readMemoryGraph("/co", "Co", { execFn, readSkills: async () => [skill("ship", "command", "/co/.claude/commands/ship.md")] })
    expect(execFn.mock.calls.map((c) => c[1][6])).toContain("HEAD:./.claude/commands/ship.md")
  })

  it("git failure gives an empty graph, never throws", async () => {
    const execFn = fakeGit({ files: [], show: {}, fail: true })
    const g = await readMemoryGraph("/co", "Co", { execFn, readSkills: async () => [] })
    expect(g.nodes).toEqual([])
    expect(g.edges).toEqual([])
  })

  it("never has more than 8 git show calls in flight", async () => {
    const files = Array.from({ length: 40 }, (_, i) => `notes/n${i}.md`)
    let inFlight = 0
    let peak = 0
    const execFn = vi.fn(async (_c: string, args: string[]) => {
      if (args[5] === "rev-parse") return { stdout: "abc123", stderr: "" }
      if (args[5] === "ls-files") return { stdout: files.join("\n"), stderr: "" }
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise((r) => setTimeout(r, 1))
      inFlight--
      return { stdout: "# T\n", stderr: "" }
    })
    const g = await readMemoryGraph("/co", "Co", { execFn, readSkills: async () => [] })
    expect(g.nodes.filter((n) => n.type === "note")).toHaveLength(40)
    expect(peak).toBeLessThanOrEqual(8)
    expect(peak).toBeGreaterThan(1)
  })

  it("serves the same HEAD sha from cache without listing again", async () => {
    const execFn = fakeGit({ files: ["notes/a.md"], show: SHOW })
    const first = await readMemoryGraph("/co", "Co", { execFn, readSkills: async () => [] })
    execFn.mockClear()
    const second = await readMemoryGraph("/co", "Co", { execFn, readSkills: async () => [] })
    expect(second).toBe(first)
    expect(execFn.mock.calls.map((c) => c[1][5])).toEqual(["rev-parse"])
  })
})
