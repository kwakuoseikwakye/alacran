import { describe, it, expect, vi, beforeEach } from "vitest"
import { clearFileMemo } from "../file-memo"
import {
  readLeads,
  readFunnelStages,
  readTransactions,
  readFinancialCategories,
  readSocialAccounts,
  readSocialSnapshots,
  readContentItems,
} from "./read"

describe("records reader", () => {
  beforeEach(() => {
    clearFileMemo()
  })

  it("returns empty records when records file does not exist", async () => {
    const statFn = vi.fn().mockRejectedValue(new Error("ENOENT"))
    const readFn = vi.fn()

    const result = await readLeads("/mock/company", readFn, statFn)
    expect(result.ok).toBe(true)
    expect(result.records).toEqual([])
  })

  it("parses valid leads YAML file", async () => {
    const yamlContent = `
schema_version: 1
records:
  - id: lead-1
    name: Alpha Co
    stage: qualified
    source: attio
    owner: human
    value: 12000
    currency: USD
    first_seen: "2026-09-01"
    last_touch: "2026-09-05"
`
    const statFn = vi.fn().mockResolvedValue({ mtimeMs: 100 })
    const readFn = vi.fn().mockResolvedValue(yamlContent)

    const result = await readLeads("/mock/company", readFn, statFn)
    expect(result.ok).toBe(true)
    expect(result.records).toHaveLength(1)
    expect(result.records[0].name).toBe("Alpha Co")
    expect(result.records[0].value).toBe(12000)
  })

  it("fails loud when file has invalid schema", async () => {
    const yamlContent = `
schema_version: 1
records:
  - id: lead-1
    name: Alpha Co
    stage: invalid_stage_name
    value: "not-a-number"
`
    const statFn = vi.fn().mockResolvedValue({ mtimeMs: 100 })
    const readFn = vi.fn().mockResolvedValue(yamlContent)

    const result = await readLeads("/mock/company", readFn, statFn)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toBeDefined()
  })

  it("parses valid transactions YAML file", async () => {
    const yamlContent = `
schema_version: 1
records:
  - id: tx-1
    date: "2026-09-02"
    description: "SaaS Invoice"
    amount: 1500
    currency: USD
    type: income
    category: revenue
    account: stripe
    status: cleared
`
    const statFn = vi.fn().mockResolvedValue({ mtimeMs: 100 })
    const readFn = vi.fn().mockResolvedValue(yamlContent)

    const result = await readTransactions("/mock/company", readFn, statFn)
    expect(result.ok).toBe(true)
    expect(result.records).toHaveLength(1)
    expect(result.records[0].description).toBe("SaaS Invoice")
    expect(result.records[0].amount).toBe(1500)
  })

  it("parses funnel stages and financial categories", async () => {
    const stagesYaml = `
schema_version: 1
records:
  - id: new
    name: New
    order: 1
`
    const catsYaml = `
schema_version: 1
records:
  - id: rev
    name: Revenue
    type: income
`
    const statFn = vi.fn().mockResolvedValue({ mtimeMs: 100 })
    const readFn1 = vi.fn().mockResolvedValue(stagesYaml)
    const readFn2 = vi.fn().mockResolvedValue(catsYaml)

    const stages = await readFunnelStages("/mock/company", readFn1, statFn)
    expect(stages.ok).toBe(true)
    expect(stages.records[0].id).toBe("new")

    const cats = await readFinancialCategories("/mock/company", readFn2, statFn)
    expect(cats.ok).toBe(true)
    expect(cats.records[0].id).toBe("rev")
  })

  it("parses social accounts, snapshots, and content items", async () => {
    const socialAccountsYaml = `
schema_version: 1
records:
  - id: x-acme
    platform: x
    handle: "@acme"
    url: "https://x.com/acme"
    followers: 5000
    last_sync: "2026-09-09"
`
    const snapshotsYaml = `
schema_version: 1
records:
  - id: snap-1
    account_id: x-acme
    date: "2026-09-09"
    followers: 5000
`
    const contentYaml = `
schema_version: 1
records:
  - id: post-1
    title: "Launch Announcement"
    status: "published"
    type: "post"
    channel: "x"
    author: "human"
`
    const statFn = vi.fn().mockResolvedValue({ mtimeMs: 100 })
    const readAccounts = vi.fn().mockResolvedValue(socialAccountsYaml)
    const readSnaps = vi.fn().mockResolvedValue(snapshotsYaml)
    const readContent = vi.fn().mockResolvedValue(contentYaml)

    const accounts = await readSocialAccounts("/mock/company", readAccounts, statFn)
    expect(accounts.ok).toBe(true)
    expect(accounts.records[0].handle).toBe("@acme")

    const snaps = await readSocialSnapshots("/mock/company", readSnaps, statFn)
    expect(snaps.ok).toBe(true)
    expect(snaps.records[0].followers).toBe(5000)

    const content = await readContentItems("/mock/company", readContent, statFn)
    expect(content.ok).toBe(true)
    expect(content.records[0].title).toBe("Launch Announcement")
  })
})
