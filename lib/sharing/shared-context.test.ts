import { describe, it, expect } from "vitest"
import { buildSharedKnowledgeBlock, previewShare, readSharedParts, MAX_SHARED_TOTAL } from "./shared-context"
import { DEFAULT_SHARE_SCOPE, type ShareLink } from "./model"
import type { Agent } from "../adapters/types"

const agent = (id: string, name: string): Agent => ({ id, name, rootPath: `/co/${id}`, kind: "command-set" }) as Agent
const A = agent("a", "Acme")
const B = agent("b", "Beta")

/** A fake disk: path -> text, and the listing is derived from it. */
function disk(files: Record<string, string>) {
  return {
    read: async (p: string) => {
      if (!(p in files)) throw new Error("ENOENT")
      return files[p]
    },
    dir: async (p: string) => Object.keys(files).filter((f) => f.startsWith(`${p}/`)).map((f) => f.slice(p.length + 1)).filter((f) => !f.includes("/")),
  }
}
const link = (scope = DEFAULT_SHARE_SCOPE): ShareLink => ({ id: "l1", from: "a", to: "b", scope, createdAt: "t" })

const files = {
  "/co/a/docs/company-summary.md": "---\nx: 1\n---\nAcme sells anvils to coyotes.\n",
  "/co/a/docs/decisions/2026-09-01-pricing.md": "# Pricing\n\n## Why\nCoyotes pay late.",
  "/co/a/docs/decisions/2026-09-05-stock.md": "# Stock\n\nKeep 40 anvils.",
  "/co/a/docs/decisions/README.md": "# Index",
  "/co/a/definitions/ontology/company.yaml": "name: Acme\nindustry: anvils\n",
  "/co/a/notes/company/messages/chat.md": "SECRET CHAT TEXT",
  "/co/a/records/finances/transactions.yaml": "records: [{amount: 5}]",
  "/co/a/secrets/key.txt": "SECRET KEY",
}

describe("readSharedParts", () => {
  it("reads only the three switches, newest decisions first, never the README", async () => {
    const d = disk(files)
    const parts = await readSharedParts(A, DEFAULT_SHARE_SCOPE, d.read, d.dir)
    expect(parts.map((p) => p.title)).toEqual([
      "Company summary",
      "Decision 2026-09-05-stock",
      "Decision 2026-09-01-pricing",
      "Definitions",
    ])
    expect(parts[0].text).toBe("Acme sells anvils to coyotes.")
  })

  it("never carries chat notes, records or secrets, whatever the scope", async () => {
    const d = disk(files)
    const text = (await readSharedParts(A, DEFAULT_SHARE_SCOPE, d.read, d.dir)).map((p) => p.text).join("\n")
    expect(text).not.toContain("SECRET")
    expect(text).not.toContain("amount")
  })

  it("honours a narrowed scope and tolerates missing files", async () => {
    const d = disk({ "/co/a/docs/company-summary.md": "Only this." })
    const parts = await readSharedParts(A, { summary: true, decisions: true, definitions: true }, d.read, d.dir)
    expect(parts.map((p) => p.key)).toEqual(["summary"])
    const none = await readSharedParts(A, { summary: false, decisions: true, definitions: false }, d.read, d.dir)
    expect(none).toEqual([])
  })
})

describe("previewShare", () => {
  it("counts what each switch that is on would let the other side read", async () => {
    const d = disk(files)
    const preview = await previewShare(A, { summary: true, decisions: true, definitions: false }, d.read, d.dir)
    expect(preview.map((p) => [p.key, p.items])).toEqual([["summary", 1], ["decisions", 2]])
    expect(preview.every((p) => p.chars > 0)).toBe(true)
  })
})

describe("buildSharedKnowledgeBlock", () => {
  it("is empty when no string points at the company, so it costs nothing", async () => {
    const d = disk(files)
    expect(await buildSharedKnowledgeBlock("a", "Acme", [link()], [A, B], d.read, d.dir)).toBe("")
  })

  it("names the sharing company, fences the text, and tells the reader to say where it came from", async () => {
    const d = disk(files)
    const block = await buildSharedKnowledgeBlock("b", "Beta", [link()], [A, B], d.read, d.dir, "NONCE123")
    expect(block).toContain("## Knowledge other companies share with Beta")
    expect(block).toContain("### Shared by Acme")
    expect(block).toContain("Acme sells anvils to coyotes.")
    expect(block).toContain("--- UNTRUSTED:NONCE123 ---")
    expect(block).toContain("--- END UNTRUSTED:NONCE123 ---")
    expect(block).toContain("say which company a fact came from")
    expect(block).not.toContain("SECRET")
  })

  it("stays under the total budget however much is shared", async () => {
    const big = { "/co/a/docs/company-summary.md": "x".repeat(50_000) }
    const many: ShareLink[] = Array.from({ length: 6 }, (_, i) => ({ ...link(), id: `l${i}`, from: `a${i}` }))
    const agents = many.map((l, i) => agent(`a${i}`, `Co${i}`))
    const d = disk(Object.fromEntries(agents.map((a) => [`/co/${a.id}/docs/company-summary.md`, big["/co/a/docs/company-summary.md"]])))
    const block = await buildSharedKnowledgeBlock("b", "Beta", many.map((l) => ({ ...l, to: "b" })), [...agents, B], d.read, d.dir)
    expect(block.length).toBeLessThan(MAX_SHARED_TOTAL + 1_500)
  })

  it("skips a link whose source company is gone, and a source with nothing to share", async () => {
    const d = disk({})
    expect(await buildSharedKnowledgeBlock("b", "Beta", [link()], [A, B], d.read, d.dir)).toBe("")
    expect(await buildSharedKnowledgeBlock("b", "Beta", [link()], [B], d.read, d.dir)).toBe("")
  })
})
