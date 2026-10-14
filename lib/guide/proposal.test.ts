import { describe, it, expect, afterEach, afterAll } from "vitest"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { addGuide, PLAIN } from "./refresh"
import { buildProposal, proposeGuide, GROUP_LIMIT, WORDING_NAME } from "./proposal"
import { parseBlock } from "./apply"
import { renderGuide } from "./render"
import type { GuideInputs } from "./render"
import { defaultExecFile } from "@/lib/default-exec-file"
import { makeRepo, cleanup } from "./test-repo"

afterEach(cleanup)
const PACKS = fs.mkdtempSync(path.join(os.tmpdir(), "guide-packs-"))
afterAll(() => fs.rmSync(PACKS, { recursive: true, force: true }))
const deps = { exec: defaultExecFile, packsRoot: PACKS }

const BASE: GuideInputs = {
  departments: [{ slug: "legal", name: "Legal", purpose: "Contracts and compliance." }],
  teams: [{ id: "sales", label: "Sales", summary: "Leads and accounts.", commands: ["follow-up-lead"] }],
  commands: [{ name: "old-brief", description: "Draft the weekly brief." }],
}
const bodyOf = (inputs: GuideInputs) => {
  const parsed = parseBlock(renderGuide(inputs).block)
  if (parsed.kind !== "ok") throw new Error("expected a block")
  return parsed.body
}
const BASE_HASH = "b".repeat(64)
const propose = (before: GuideInputs, after: GuideInputs) => buildProposal(bodyOf(before), renderGuide(after), BASE_HASH)

describe("buildProposal", () => {
  it("finds nothing to change when the guide is the same", () => {
    const p = propose(BASE, BASE)
    expect(p.groups).toEqual([])
    expect(p.counts).toEqual({ new: 0, reworded: 0, removed: 0 })
  })

  it("groups new, reworded and removed items by section, in teams, commands, departments order", () => {
    const after: GuideInputs = {
      departments: [{ slug: "legal", name: "Legal", purpose: "Contracts, compliance and vendor reviews." }],
      teams: [
        BASE.teams[0],
        { id: "marketing", label: "Marketing", summary: "Campaigns, content and positioning.", commands: [] },
      ],
      commands: [{ name: "pricing-strategy", description: "Work out a pricing model and test it against your costs." }],
    }
    const p = propose(BASE, after)
    expect(p.groups.map((g) => g.section)).toEqual(["teams", "commands", "departments"])
    expect(p.groups[0].items).toEqual([{ kind: "new", name: "Marketing", after: "Campaigns, content and positioning." }])
    expect(p.groups[1].items).toEqual([
      { kind: "removed", name: "/old-brief", before: "Draft the weekly brief." },
      { kind: "new", name: "/pricing-strategy", after: "Work out a pricing model and test it against your costs." },
    ])
    expect(p.groups[2].items).toEqual([
      { kind: "reworded", name: "Legal", before: "Contracts and compliance.", after: "Contracts, compliance and vendor reviews." },
    ])
    expect(p.counts).toEqual({ new: 2, reworded: 1, removed: 1 })
    expect(p.id).toBe(renderGuide(after).bodyHash)
    expect(p.baseBodyHash).toBe(BASE_HASH)
  })

  it("shows a changed team as reworded, with the commands it gained in its text", () => {
    const after: GuideInputs = { ...BASE, teams: [{ ...BASE.teams[0], commands: ["follow-up-lead", "quote-deal"] }] }
    const [group] = propose(BASE, after).groups
    expect(group.section).toBe("teams")
    expect(group.items).toHaveLength(1)
    expect(group.items[0]).toMatchObject({ kind: "reworded", name: "Sales" })
    expect(group.items[0].after).toContain("/quote-deal")
    expect(group.items[0].before).not.toContain("/quote-deal")
  })

  it("adds one wording item when only the fixed text changed (an app update), and no list groups", () => {
    const oldBody = bodyOf(BASE).replace("Read the company's", "Read my")
    const p = buildProposal(oldBody, renderGuide(BASE), BASE_HASH)
    expect(p.groups).toEqual([{ section: "wording", items: [{ kind: "reworded", name: WORDING_NAME }], more: 0 }])
    expect(p.counts).toEqual({ new: 0, reworded: 1, removed: 0 })
  })

  it("a block rendered with version=1 is not up to date against the new render, and the wording group says so", () => {
    const now = renderGuide(BASE)
    const old = now.block.replace(/version=\d+/, "version=1").replace(/fingerprint=\w+/, "fingerprint=" + "a".repeat(64))
    expect(old).not.toBe(now.block)
    const parsed = parseBlock(old)
    if (parsed.kind !== "ok") throw new Error("expected a block")
    expect(parsed.fingerprint).not.toBe(now.fingerprint)
    const oldBody = bodyOf(BASE).replace("Before drafting anything for the owner, read definitions/preferences.md if it exists and follow it.\n", "")
    const p = buildProposal(oldBody, now, BASE_HASH)
    expect(p.groups).toEqual([{ section: "wording", items: [{ kind: "reworded", name: WORDING_NAME }], more: 0 }])
  })

  it("does not call the (none yet) placeholder a change", () => {
    const empty: GuideInputs = { departments: [], teams: [], commands: [] }
    expect(propose(empty, empty).groups).toEqual([])
    const p = propose(empty, BASE)
    expect(p.counts).toEqual({ new: 3, reworded: 0, removed: 0 })
    expect(p.groups.flatMap((g) => g.items.map((i) => i.kind))).toEqual(["new", "new", "new"])
  })

  it("keeps the first 20 items per group and counts all of them", () => {
    const many: GuideInputs = {
      ...BASE,
      commands: Array.from({ length: GROUP_LIMIT + 5 }, (_, i) => ({ name: `cmd-${String(i).padStart(2, "0")}`, description: "x" })),
    }
    const p = propose({ ...BASE, commands: [] }, many)
    const commands = p.groups.find((g) => g.section === "commands")!
    expect(commands.items).toHaveLength(GROUP_LIMIT)
    expect(commands.more).toBe(5)
    expect(p.counts.new).toBe(GROUP_LIMIT + 5)
  })

  it("is not thrown by labels with colons, lines with no colon, or duplicate keys", () => {
    const odd = "## How this company works\n\n### Departments\n- no colon here\n- Same: one (records/dup/)\n- Same: two (records/dup/)\n\n### Installed teams\n- R&D: Labs: Deep work.\n\n### Company commands\n- /a\n"
    expect(() => buildProposal(odd, renderGuide(BASE), BASE_HASH)).not.toThrow()
    const p = buildProposal(odd, renderGuide(BASE), BASE_HASH)
    expect(p.counts.new + p.counts.reworded + p.counts.removed).toBeGreaterThan(0)
  })

  it("carries hostile text as plain, already-escaped strings (no comment delimiters)", () => {
    const hostile: GuideInputs = { ...BASE, departments: [{ slug: "x", name: "X", purpose: "a <!-- b --> c\n- injected: line" }] }
    const p = propose(BASE, hostile)
    const text = JSON.stringify(p.groups)
    expect(text).not.toContain("<!--")
    expect(text).not.toContain("-->")
    expect(p.groups[0].items.every((i) => !(i.after ?? "").includes("\n"))).toBe(true)
  })

  it("treats CRLF in the file the same as LF", () => {
    const crlf = bodyOf(BASE).replace(/\n/g, "\r\n")
    const p = buildProposal(crlf, renderGuide(BASE), BASE_HASH)
    expect(p.groups).toEqual([])
    expect(p.oldBody).not.toContain("\r")
  })

  // A plain-object lookup finds these names on Object.prototype, so a bare line like "constructor" used to count as a
  // heading and make the next "- " line throw. They are ordinary text, and so is the list-looking line after them.
  it.each(["constructor", "__proto__", "toString", "valueOf", "hasOwnProperty"])("a body line that is just %s is ordinary text, not a heading", (word) => {
    const forged = `${word}\n- x\n${bodyOf(BASE)}`
    expect(() => buildProposal(forged, renderGuide(BASE), BASE_HASH)).not.toThrow()
    const p = buildProposal(forged, renderGuide(BASE), BASE_HASH)
    expect(p.groups).toEqual([{ section: "wording", items: [{ kind: "reworded", name: WORDING_NAME }], more: 0 }])
    expect(p.counts).toEqual({ new: 0, reworded: 1, removed: 0 })
  })

  describe("bodies that differ only by order or a repeated line", () => {
    const TWO: GuideInputs = {
      ...BASE,
      departments: [BASE.departments[0], { slug: "sales", name: "Sales", purpose: "Leads and accounts." }],
    }
    const lines = () => bodyOf(TWO).split("\n")
    const legalAt = () => lines().findIndex((l) => l.includes("(records/legal/)"))
    const WORDING = [{ section: "wording", items: [{ kind: "reworded", name: WORDING_NAME }], more: 0 }]

    it("two department lines in the other order are one reworded item, never 0 changes", () => {
      const swapped = lines()
      const i = legalAt()
      ;[swapped[i], swapped[i + 1]] = [swapped[i + 1], swapped[i]]
      const p = buildProposal(swapped.join("\n"), renderGuide(TWO), BASE_HASH)
      expect(p.oldBody).not.toBe(p.newBody)
      expect(p.groups).toEqual(WORDING)
      expect(p.counts).toEqual({ new: 0, reworded: 1, removed: 0 })
    })

    it("an identical line repeated in the file is one reworded item, never 0 changes", () => {
      const repeated = lines()
      repeated.splice(legalAt(), 0, repeated[legalAt()])
      const p = buildProposal(repeated.join("\n"), renderGuide(TWO), BASE_HASH)
      expect(p.oldBody).not.toBe(p.newBody)
      expect(p.groups).toEqual(WORDING)
      expect(p.counts).toEqual({ new: 0, reworded: 1, removed: 0 })
    })

    it("adds the wording item once when the standard wording also changed", () => {
      const swapped = lines()
      const i = legalAt()
      ;[swapped[i], swapped[i + 1]] = [swapped[i + 1], swapped[i]]
      const p = buildProposal(swapped.join("\n").replace("Read the company's", "Read my"), renderGuide(TWO), BASE_HASH)
      expect(p.groups).toEqual(WORDING)
      expect(p.counts.reworded).toBe(1)
    })

    it("still finds nothing when the bodies are the same", () => {
      const p = buildProposal(bodyOf(TWO), renderGuide(TWO), BASE_HASH)
      expect(p.groups).toEqual([])
      expect(p.counts).toEqual({ new: 0, reworded: 0, removed: 0 })
    })
  })
})

describe("proposeGuide", () => {
  const dept = (name: string) => `departments:\n  - {slug: ${name.toLowerCase()}, name: ${name}, purpose: Handles ${name}., color: "#0369a1"}\n`
  async function companyWithGuide() {
    const r = makeRepo()
    r.write("AGENTS.md", "# Working agreement\n\nOwner rules.\n")
    r.commitAll()
    expect(await addGuide(r.dir, deps)).toMatchObject({ ok: true })
    r.commitAll("guide")
    return r
  }

  it("says not-added when there is no block, and up-to-date when nothing changed", async () => {
    const r = makeRepo()
    r.write("AGENTS.md", "# Working agreement\n")
    r.commitAll()
    expect(await proposeGuide(r.dir, deps)).toEqual({ kind: "none", state: { state: "not-added" } })
    const g = await companyWithGuide()
    expect(await proposeGuide(g.dir, deps)).toEqual({ kind: "none", state: { state: "up-to-date" } })
  })

  it("proposes a department added outside the app, and writes nothing", async () => {
    const r = await companyWithGuide()
    r.write("definitions/departments.yaml", dept("Legal"))
    r.commitAll("dept")
    const before = r.read("AGENTS.md")
    const res = await proposeGuide(r.dir, deps)
    expect(res.kind).toBe("proposal")
    if (res.kind !== "proposal") return
    expect(res.proposal.groups.map((g) => g.section)).toEqual(["departments"])
    expect(res.proposal.groups[0].items[0]).toMatchObject({ kind: "new", name: "Legal" })
    const block = parseBlock(before)
    expect(block.kind === "ok" && block.bodyHash).toBe(res.proposal.baseBodyHash)
    expect(res.proposal.id).not.toBe(res.proposal.baseBodyHash)
    expect(r.read("AGENTS.md")).toBe(before)
    expect(r.git("status", "--porcelain").trim()).toBe("")
    expect(r.git("rev-list", "--count", "HEAD").trim()).toBe("4")
  })

  it("is not a proposal while AGENTS.md has unsaved changes, and is again once they are saved", async () => {
    const r = await companyWithGuide()
    r.write("definitions/departments.yaml", dept("Legal"))
    r.commitAll("dept")
    r.write("AGENTS.md", `${r.read("AGENTS.md")}\nOwner added a line.\n`)
    expect(await proposeGuide(r.dir, deps)).toMatchObject({ kind: "none", state: { state: "needs-attention", reason: "dirty" } })
    r.commitAll("owner line")
    expect(await proposeGuide(r.dir, deps)).toMatchObject({ kind: "proposal" })
  })

  it("is not a proposal when the block was edited by hand", async () => {
    const r = await companyWithGuide()
    r.write("definitions/departments.yaml", dept("Legal"))
    r.write("AGENTS.md", r.read("AGENTS.md").replace("Read the company's", "Read my"))
    r.commitAll("edit")
    expect(await proposeGuide(r.dir, deps)).toMatchObject({ kind: "none", state: { state: "needs-attention", reason: "edited" } })
  })

  it("is up to date when only the hidden fingerprint differs and the text is the same", async () => {
    const r = await companyWithGuide()
    r.write("AGENTS.md", r.read("AGENTS.md").replace(/fingerprint=[0-9a-f]{64}/, `fingerprint=${"c".repeat(64)}`))
    r.commitAll("stamp")
    expect(await proposeGuide(r.dir, deps)).toEqual({ kind: "none", state: { state: "up-to-date" } })
  })

  it("never throws for a root that does not exist", async () => {
    const res = await proposeGuide("/definitely/not/a/company", deps)
    expect(res.kind).toBe("none")
  })

  it("says needs-attention/unreadable, and does not throw, when AGENTS.md cannot be read at all", async () => {
    const r = makeRepo()
    fs.mkdirSync(path.join(r.dir, "AGENTS.md")) // reading a directory fails with EISDIR, which is not a missing file
    expect(await proposeGuide(r.dir, deps)).toEqual({ kind: "none", state: { state: "needs-attention", reason: "unreadable", detail: PLAIN } })
  })
})
