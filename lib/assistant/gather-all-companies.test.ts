import { describe, expect, it } from "vitest"
import path from "node:path"
import {
  gatherAllCompanies,
  formatCompanyContext,
  isAssistantCompany,
  MAX_PER_COMPANY,
  MAX_TOTAL,
  ONTOLOGY_PATH,
  summarizeActivityText,
  type ReadFileFn,
} from "./gather-all-companies"
import { COMPANY_SUMMARY_PATH } from "../company-summary"
import type { Agent } from "../adapters/types"

const agent = (id: string, kind: Agent["kind"] = "command-set"): Agent => ({
  id,
  name: `${id} Co`,
  rootPath: `/root/${id}`,
  kind,
})

/** Serves only the files listed; everything else throws, like a real missing file. */
function fsWith(files: Record<string, string>): ReadFileFn {
  return async (filePath) => {
    const content = files[filePath]
    if (content === undefined) throw new Error("ENOENT")
    return content
  }
}

describe("gatherAllCompanies", () => {
  it("prefers the company summary", async () => {
    const files = { [path.join("/root/a", COMPANY_SUMMARY_PATH)]: "we sell bread" }
    const [context] = await gatherAllCompanies([agent("a")], fsWith(files))
    expect(context.source).toBe("summary")
    expect(context.text).toBe("we sell bread")
  })

  it("falls back to the ontology when no summary exists", async () => {
    const files = { [path.join("/root/a", ONTOLOGY_PATH)]: "company_summary: bakery" }
    const [context] = await gatherAllCompanies([agent("a")], fsWith(files))
    expect(context.source).toBe("ontology")
    expect(context.text).toBe("company_summary: bakery")
  })

  it("still returns a company with neither file, as name-only", async () => {
    // The fresh-install state: company-summary.md is only written when Get
    // Started runs, and was absent on 2 of 3 real companies when measured.
    const [context] = await gatherAllCompanies([agent("a")], fsWith({}))
    expect(context.source).toBe("name-only")
    expect(context.text).toBe("")
    expect(context.name).toBe("a Co")
  })

  it("treats an empty summary as absent rather than as an answer", async () => {
    const files = {
      [path.join("/root/a", COMPANY_SUMMARY_PATH)]: "   \n  ",
      [path.join("/root/a", ONTOLOGY_PATH)]: "company_summary: bakery",
    }
    const [context] = await gatherAllCompanies([agent("a")], fsWith(files))
    expect(context.source).toBe("ontology")
  })

  it("excludes external folders, which are not companies this app manages", async () => {
    const contexts = await gatherAllCompanies([agent("a"), agent("b", "external")], fsWith({}))
    expect(contexts.map((c) => c.id)).toEqual(["a"])
  })

  it("caps a single company and marks it truncated", async () => {
    const files = { [path.join("/root/a", COMPANY_SUMMARY_PATH)]: "x".repeat(MAX_PER_COMPANY + 500) }
    const [context] = await gatherAllCompanies([agent("a")], fsWith(files))
    expect(context.text).toHaveLength(MAX_PER_COMPANY)
    expect(context.truncated).toBe(true)
  })

  it("degrades later companies to name-only once the total budget is spent, never dropping them", async () => {
    // Dropping them would let the assistant answer "you have four companies"
    // on a machine with nine — a confident wrong answer about the one thing
    // this page exists to know.
    const many = Array.from({ length: 20 }, (_, i) => agent(`c${i}`))
    const files = Object.fromEntries(
      many.map((a) => [path.join(a.rootPath, COMPANY_SUMMARY_PATH), "y".repeat(MAX_PER_COMPANY)])
    )
    const contexts = await gatherAllCompanies(many, fsWith(files))

    expect(contexts).toHaveLength(20)
    const total = contexts.reduce((sum, c) => sum + c.text.length, 0)
    expect(total).toBeLessThanOrEqual(MAX_TOTAL)
    expect(contexts.at(-1)?.source).toBe("name-only")
  })
})

describe("formatCompanyContext", () => {
  it("labels a company with nothing written down, so the model cannot invent one", async () => {
    const contexts = await gatherAllCompanies([agent("a")], fsWith({}))
    const block = formatCompanyContext(contexts)
    expect(block).toContain("a Co")
    expect(block).toContain("No description written yet")
    expect(block).toContain("do not guess")
  })

  it("names every company as its own section", async () => {
    const files = {
      [path.join("/root/a", COMPANY_SUMMARY_PATH)]: "bread",
      [path.join("/root/b", COMPANY_SUMMARY_PATH)]: "bikes",
    }
    const block = formatCompanyContext(await gatherAllCompanies([agent("a"), agent("b")], fsWith(files)))
    expect(block).toContain("### a Co")
    expect(block).toContain("### b Co")
  })

  it("says so plainly when there are no companies at all", () => {
    expect(formatCompanyContext([])).toContain("no companies")
  })
})

describe("isAssistantCompany", () => {
  it("keeps every managed kind and rejects external", () => {
    expect(isAssistantCompany(agent("a", "command-set"))).toBe(true)
    expect(isAssistantCompany(agent("a", "report-log"))).toBe(true)
    expect(isAssistantCompany(agent("a", "external"))).toBe(false)
  })
})

describe("summarizeActivityText separators", () => {
  it("strips a same-line colon or dash after a section label", () => {
    const out = summarizeActivityText("**What we worked on**: Pricing call.\n\n**What's still open** \u2014 Contract draft.")
    expect(out).toBe("Worked on: Pricing call. | Open: Contract draft.")
  })
})

describe("operational pulse", () => {
  it("extracts session note pulse with worked on and open sections", async () => {
    const sessionContent = `---
type: session-note
---

**What we worked on**
Upgraded the voice loop for hands-free conversations.

**What's still open**
Multi-turn browser integration testing.`

    const files = {
      [path.join("/root/a", COMPANY_SUMMARY_PATH)]: "Acme bakery",
      [path.join("/root/a", "notes/company/sessions/2026-09-04-voice.md")]: sessionContent,
    }
    const readDir = async (dir: string) => {
      if (dir === path.join("/root/a", "notes/company/sessions")) {
        return ["2026-09-04-voice.md"]
      }
      return []
    }
    const listReviews = async () => [{ agentId: "a", commandId: "digest" }]

    const [context] = await gatherAllCompanies([agent("a")], fsWith(files), listReviews, readDir)

    expect(context.pulse).toBeDefined()
    expect(context.pulse?.pendingReviewsCount).toBe(1)
    expect(context.pulse?.lastSessionSummary).toContain("Worked on: Upgraded the voice loop")
    expect(context.pulse?.lastSessionSummary).toContain("Open: Multi-turn browser integration")

    const formatted = formatCompanyContext([context])
    expect(formatted).toContain("Operational Pulse:")
    expect(formatted).toContain("1 uncommitted run(s) waiting for human approval")
    expect(formatted).toContain("Recent activity:")
  })

  it("falls back to HANDOFF.md when no session notes exist", async () => {
    const handoffContent = `# HANDOFF

## Current Status
Finished the landing page redesign with 0 animations.

## Next up
Run end to end tests.`

    const files = {
      [path.join("/root/a", COMPANY_SUMMARY_PATH)]: "Acme bakery",
      [path.join("/root/a", "HANDOFF.md")]: handoffContent,
    }
    const readDir = async () => []
    const listReviews = async () => []

    const [context] = await gatherAllCompanies([agent("a")], fsWith(files), listReviews, readDir)

    expect(context.pulse).toBeDefined()
    expect(context.pulse?.pendingReviewsCount).toBe(0)
    expect(context.pulse?.lastSessionSummary).toContain("Finished the landing page redesign")

    const formatted = formatCompanyContext([context])
    expect(formatted).toContain("Pending reviews: None (working tree clean)")
    expect(formatted).toContain("Finished the landing page redesign")
  })
})

describe("cross-company decisions and two-tier retrieval", () => {
  it("gathers cross-company decisions from docs/decisions", async () => {
    const decisionA = `---
type: decision
---
# Decision: SQLite WAL Storage
## Context
Local-first data.
## Decision
Adopt SQLite WAL mode for fast concurrency.`

    const files = {
      [path.join("/root/a", "docs/decisions/2026-08-14-sqlite-wal.md")]: decisionA,
    }
    const readDir = async (dir: string) => {
      if (dir === path.join("/root/a", "docs/decisions")) {
        return ["2026-08-14-sqlite-wal.md"]
      }
      return []
    }

    const { gatherCrossCompanyDecisions } = await import("./gather-all-companies")
    const decisions = await gatherCrossCompanyDecisions([agent("a")], fsWith(files), readDir)

    expect(decisions).toHaveLength(1)
    expect(decisions[0].slug).toBe("2026-08-14-sqlite-wal")
    expect(decisions[0].title).toBe("SQLite WAL Storage")
    expect(decisions[0].summary).toContain("Adopt SQLite WAL mode")
  })

  it("compresses non-focal companies to Tier 1 when focalCompanyIds are provided", async () => {
    const files = {
      [path.join("/root/a", COMPANY_SUMMARY_PATH)]: "Full detailed description of Acme bakery selling pastries.",
      [path.join("/root/b", COMPANY_SUMMARY_PATH)]: "Full detailed description of Beta corp providing cloud infrastructure services.",
    }
    const contexts = await gatherAllCompanies([agent("a"), agent("b")], fsWith(files))

    // Only "a" is focal
    const formatted = formatCompanyContext(contexts, { focalCompanyIds: ["a"] })

    expect(formatted).toContain("### a Co")
    expect(formatted).toContain("Summary:\nFull detailed description of Acme bakery")

    expect(formatted).toContain("### b Co")
    expect(formatted).toContain("Summary (brief):")
  })

  it("appends the Cross-Company Decision Index when provided", () => {
    const contexts = [
      {
        id: "a",
        name: "Acme",
        kind: "command-set",
        source: "summary" as const,
        text: "summary",
        truncated: false,
      },
    ]
    const decisions = [
      {
        companyId: "b",
        companyName: "Beta Corp",
        slug: "2026-08-20-auth",
        title: "JWT Authentication",
        summary: "Use stateless JWTs.",
      },
    ]

    const formatted = formatCompanyContext(contexts, { crossCompanyDecisions: decisions })
    expect(formatted).toContain("Cross-Company Decision Index")
    expect(formatted).toContain("[Beta Corp] 2026-08-20-auth (\"JWT Authentication\"): Use stateless JWTs.")
  })

  it("gathers milestone retrospectives alongside decisions", async () => {
    const retroContent = `---
type: retro
---
# Retro: v0.60.0 Launch
## Key Takeaway
Shipped local-first database sync with zero cloud dependencies.`

    const files = {
      [path.join("/root/a", "docs/retros/2026-09-10-retro.md")]: retroContent,
    }
    const readDir = async (dir: string) => {
      if (dir === path.join("/root/a", "docs/retros")) {
        return ["2026-09-10-retro.md"]
      }
      return []
    }

    const { gatherCrossCompanyDecisions } = await import("./gather-all-companies")
    const entries = await gatherCrossCompanyDecisions([agent("a")], fsWith(files), readDir)

    expect(entries).toHaveLength(1)
    expect(entries[0].slug).toBe("2026-09-10-retro")
    expect(entries[0].title).toBe("Retro: v0.60.0 Launch")
    expect(entries[0].summary).toContain("Shipped local-first database sync")
  })
})

describe("operational records & token efficiency", () => {
  it("reads live operations including finances, pipeline, audience, and content", async () => {
    const transactionsYaml = `records:
  - id: tx-1
    type: income
    amount: 15000
  - id: tx-2
    type: expense
    amount: 4000`

    const leadsYaml = `records:
  - id: lead-1
    stage: proposal
    value: 25000
  - id: lead-2
    stage: lost
    value: 10000`

    const socialYaml = `records:
  - platform: x
    followers: 3200
  - platform: linkedin
    followers: 1800`

    const contentYaml = `records:
  - id: post-1
    title: Launch
  - id: post-2
    title: Roadmap`

    const files = {
      [path.join("/root/a", "records/finances/transactions.yaml")]: transactionsYaml,
      [path.join("/root/a", "records/funnel/leads.yaml")]: leadsYaml,
      [path.join("/root/a", "records/social/accounts.yaml")]: socialYaml,
      [path.join("/root/a", "records/content/items.yaml")]: contentYaml,
    }

    const readDir = async (dir: string) => {
      if (dir === path.join("/root/a", "records")) {
        return ["finances", "funnel", "social", "content"]
      }
      return []
    }

    const { readOperations } = await import("./gather-all-companies")
    const ops = await readOperations(agent("a"), fsWith(files), readDir)

    expect(ops).toBeDefined()
    expect(ops?.cashBalance).toContain("$11,000 net")
    expect(ops?.pipelineTotal).toContain("$25,000 across 1 active deal")
    expect(ops?.audienceCount).toBe(5000)
    expect(ops?.contentCount).toBe(2)
    expect(ops?.departments).toEqual(["Finances", "Funnel", "Social", "Content"])
  })

  it("shows the current name and the real folder for a defined department, and only the title for one that does not", async () => {
    // The name differs from the title-cased slug, as it does after a rename: the list must say the new name.
    const files = {
      [path.join("/root/a", "definitions/departments.yaml")]: `departments:
  - slug: sales-ops
    name: Revenue Team
    purpose: Leads and deals.
    color: "#0369a1"`,
    }
    const readDir = async (dir: string) =>
      dir === path.join("/root/a", "records") ? ["sales-ops", "finances", "legacy-folder"] : []

    const { readOperations } = await import("./gather-all-companies")
    const ops = await readOperations(agent("a"), fsWith(files), readDir)

    // "Legacy Folder" has no definition, so no folder name is invented for it.
    expect(ops?.departments).toEqual(["Revenue Team (folder: sales-ops)", "Finances", "Legacy Folder"])
  })

  it("falls back to the title for a definition with no usable name, and tolerates a malformed file", async () => {
    const readDir = async (dir: string) => (dir === path.join("/root/a", "records") ? ["sales-ops", "finances"] : [])
    const { readOperations } = await import("./gather-all-companies")

    const noName = {
      [path.join("/root/a", "definitions/departments.yaml")]: `departments:\n  - slug: sales-ops\n    name: 7\n    purpose: x\n    color: "#000000"\n`,
    }
    expect((await readOperations(agent("a"), fsWith(noName), readDir))?.departments).toEqual(["Sales Ops (folder: sales-ops)", "Finances"])

    const malformed = { [path.join("/root/a", "definitions/departments.yaml")]: "departments: [: not yaml" }
    expect((await readOperations(agent("a"), fsWith(malformed), readDir))?.departments).toEqual(["Sales Ops", "Finances"])
  })

  it("distills company summary to avoid burning prompt tokens on tool catalogs", async () => {
    const rawSummary = `# Acme Corp
Acme builds durable hardware tools for modern founders.

## What I Can Help With
- Extensive tool listing line 1
- Extensive tool listing line 2
- Extensive tool listing line 3`

    const { distillCompanySummary } = await import("./gather-all-companies")
    const distilled = distillCompanySummary(rawSummary)

    expect(distilled).toContain("Acme builds durable hardware tools for modern founders.")
    expect(distilled).not.toContain("## What I Can Help With")
    expect(distilled).not.toContain("Extensive tool listing")
  })

  it("formats live operations for focal and non-focal companies", () => {
    const contexts = [
      {
        id: "a",
        name: "Acme",
        kind: "command-set",
        source: "summary" as const,
        text: "Acme summary",
        truncated: false,
        operations: {
          cashBalance: "$12,000 net",
          pipelineTotal: "$40,000 across 3 deals",
          audienceCount: 2500,
          contentCount: 4,
          departments: ["Finances", "Funnel"],
        },
      },
      {
        id: "b",
        name: "Beta",
        kind: "command-set",
        source: "summary" as const,
        text: "Beta summary",
        truncated: false,
        operations: {
          cashBalance: "$5,000 net",
          pipelineTotal: "$15,000",
          departments: ["Tech"],
        },
      },
    ]

    // Only 'a' is focal
    const formatted = formatCompanyContext(contexts, { focalCompanyIds: ["a"] })

    // Focal company 'a' receives detailed operations
    expect(formatted).toContain("### Acme")
    expect(formatted).toContain("Live Operations & Records:")
    expect(formatted).toContain("Ledger Balance: $12,000 net")
    expect(formatted).toContain("Pipeline: $40,000 across 3 deals")
    expect(formatted).toContain("Audience: 2,500 followers")
    expect(formatted).toContain("Content: 4 item(s)")
    expect(formatted).toContain("Departments: Finances, Funnel")

    // Non-focal company 'b' receives compressed 1-line operations to save tokens
    expect(formatted).toContain("### Beta")
    expect(formatted).toContain("Summary (brief): Beta summary")
    expect(formatted).toContain("Operations: $5,000, Pipeline: $15,000, 1 depts")
  })
})


