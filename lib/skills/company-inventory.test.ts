import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { readdirSync, statSync } from "node:fs"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { readCompanyInventory, formatInventory, NO_INVENTORY } from "./company-inventory"
import type { SkillEntry } from "./types"

function entry(over: Partial<SkillEntry>): SkillEntry {
  return { id: "x", agentId: "", kind: "skill", name: "n", description: "", path: "x", ...over }
}

/** Every .md byte under a folder — what "read every skill or command file" cost. */
function markdownBytes(dir: string): number {
  let total = 0
  const walk = (d: string) => {
    let names: string[] = []
    try {
      names = readdirSync(d)
    } catch {
      return
    }
    for (const n of names) {
      const p = path.join(d, n)
      if (statSync(p).isDirectory()) walk(p)
      else if (n.endsWith(".md")) total += statSync(p).size
    }
  }
  walk(dir)
  return total
}

describe("formatInventory", () => {
  it("names each entry with its kind and description", () => {
    expect(formatInventory([entry({ name: "digest", kind: "command", description: "Summarise notes" })])).toBe(
      "- digest (command) — Summarise notes"
    )
  })

  it("says so plainly when a company has nothing installed", () => {
    expect(formatInventory([])).toBe(NO_INVENTORY)
  })

  it("clips a long description rather than dropping the entry", () => {
    const [line] = formatInventory([entry({ name: "big", description: "x".repeat(500) })]).split("\n")
    expect(line.length).toBeLessThan(260)
    expect(line).toContain("big")
    expect(line).toContain("…")
  })

  it("flattens newlines, so one entry is always one line", () => {
    const text = formatInventory([entry({ name: "a", description: "one\ntwo" }), entry({ name: "b" })])
    expect(text.split("\n")).toHaveLength(2)
  })
})

describe("readCompanyInventory across the shared and legacy folders", () => {
  let dir: string
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "inventory-shared-"))
  })
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })
  const put = async (rel: string, text: string) => {
    const file = path.join(dir, ...rel.split("/"))
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, text)
  }
  const skill = (name: string) => `---\nname: ${name}\ndescription: A ${name}.\n---\n`

  it("lists a shared skill once even though the agents' own folders hold copies of it", async () => {
    await put(".agents/skills/probe/SKILL.md", skill("probe"))
    await put(".claude/skills/probe/SKILL.md", skill("probe"))
    await put(".kiro/skills/probe/SKILL.md", skill("probe"))

    const lines = (await readCompanyInventory(dir)).split("\n")

    expect(lines).toEqual(["- probe (skill) — A probe."])
  })

  it("still lists commands and Kiro skills that were never moved", async () => {
    await put(".claude/commands/verify.md", skill("verify"))
    await put(".kiro/skills/kiro-only/SKILL.md", skill("kiro-only"))

    const lines = (await readCompanyInventory(dir)).split("\n")

    expect(lines).toEqual(["- verify (command) — A verify.", "- kiro-only (skill) — A kiro-only."])
  })

  it("says so when nothing is installed", async () => {
    expect(await readCompanyInventory(dir)).toBe(NO_INVENTORY)
  })
})

describe("readCompanyInventory", () => {
  it("returns empty text for a folder with no .claude at all", async () => {
    expect(await readCompanyInventory(path.join(process.cwd(), "does-not-exist"))).toBe(NO_INVENTORY)
  })

  /**
   * Against the REAL bundled templates, per this repo's own rule that a
   * synthetic fixture cannot catch this class of drift. The assertion is the
   * point of the module: the list has to stay a small fraction of what reading
   * every file would have cost, however large the packs grow.
   */
  it("costs a fraction of reading every file, measured on the real packs", async () => {
    for (const rel of ["templates/company-starter", "templates/packs/marketing", "templates/packs/hr-people"]) {
      const root = path.join(process.cwd(), rel)
      // Commands are flat under .claude; pack skills live in the shared .agents folder.
      const before = markdownBytes(path.join(root, ".claude")) + markdownBytes(path.join(root, ".agents"))
      const after = (await readCompanyInventory(root)).length
      expect(before, rel).toBeGreaterThan(0)
      expect(after, rel).toBeGreaterThan(0)
      console.log(
        `${rel.padEnd(36)} read-everything ${String(before).padStart(7)}B → inventory ${String(after).padStart(6)}B  (${(before / after).toFixed(0)}x smaller)`
      )
      expect(after, `${rel} inventory should be far smaller than reading every file`).toBeLessThan(before / 10)
    }
  })
})
