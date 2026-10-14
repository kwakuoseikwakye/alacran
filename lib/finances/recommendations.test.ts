import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { promises as fs } from "node:fs"
import path from "node:path"
import os from "node:os"
import {
  parseRecommendation,
  listRecommendations,
  isSafeRecommendationFileName,
  updateFrontmatterStatus,
} from "./recommendations"

describe("recommendations parser and model", () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "alacran-finances-rec-test-"))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  it("validates safe recommendation file names", () => {
    expect(isSafeRecommendationFileName("2026-09-27-figma.md")).toBe(true)
    expect(isSafeRecommendationFileName("rec-aws-reserved.md")).toBe(true)
    expect(isSafeRecommendationFileName("../secret.md")).toBe(false)
    expect(isSafeRecommendationFileName("nested/file.md")).toBe(false)
    expect(isSafeRecommendationFileName("something.txt")).toBe(false)
  })

  it("parses valid recommendation frontmatter and body sections", () => {
    const raw = `---
id: "rec-2026-09-27-figma"
date: "2026-09-27"
title: "Downgrade 3 inactive Figma editor seats"
vendor: "Figma"
category: "Software & Subscriptions"
action_type: "downgrade"
potential_savings_monthly: 45
currency: "USD"
status: "pending"
priority: "high"
vendor_url: "https://figma.com/settings/billing"
---
### Audit finding & rationale
We found 3 inactive editor seats over the past 60 days.

### Action plan
Change seats to viewer tier before Oct 1.

### Draft vendor / support outreach
Hello Figma support, please downgrade 3 editor seats to free viewers.`

    const rec = parseRecommendation(raw, "2026-09-27-figma.md", "/fake/path/2026-09-27-figma.md")
    expect(rec).not.toBeNull()
    expect(rec?.id).toBe("rec-2026-09-27-figma")
    expect(rec?.vendor).toBe("Figma")
    expect(rec?.potentialSavingsMonthly).toBe(45)
    expect(rec?.actionType).toBe("downgrade")
    expect(rec?.status).toBe("pending")
    expect(rec?.finding).toContain("3 inactive editor seats")
    expect(rec?.actionPlan).toContain("Change seats to viewer tier")
    expect(rec?.draftPitch).toContain("Hello Figma support")
  })

  it("lists and filters recommendations by status", async () => {
    const recDir = path.join(tmpDir, "notes", "finances", "recommendations")
    await fs.mkdir(recDir, { recursive: true })

    await fs.writeFile(
      path.join(recDir, "2026-09-27-figma.md"),
      `---
id: "rec-1"
date: "2026-09-27"
title: "Figma downgrade"
vendor: "Figma"
category: "Software"
action_type: "downgrade"
potential_savings_monthly: 45
status: "pending"
priority: "high"
---
### Audit finding & rationale
Inactive seats.
### Action plan
Downgrade.
### Draft vendor / support outreach
Pitch.`
    )

    await fs.writeFile(
      path.join(recDir, "2026-09-27-datadog.md"),
      `---
id: "rec-2"
date: "2026-09-27"
title: "Datadog commit"
vendor: "Datadog"
category: "Infrastructure"
action_type: "negotiate"
potential_savings_monthly: 120
status: "approved"
priority: "medium"
---
### Audit finding & rationale
High log indexing.
### Action plan
Commit.
### Draft vendor / support outreach
Outreach.`
    )

    const all = await listRecommendations(tmpDir)
    expect(all.length).toBe(2)

    const pending = await listRecommendations(tmpDir, "pending")
    expect(pending.length).toBe(1)
    expect(pending[0].vendor).toBe("Figma")

    const approved = await listRecommendations(tmpDir, "approved")
    expect(approved.length).toBe(1)
    expect(approved[0].vendor).toBe("Datadog")
  })

  it("sorts recommendations by priority (high > medium > low) and then savings desc", async () => {
    const recDir = path.join(tmpDir, "notes", "finances", "recommendations")
    await fs.mkdir(recDir, { recursive: true })

    await fs.writeFile(
      path.join(recDir, "rec-low.md"),
      `---
id: "rec-low"
priority: "low"
potential_savings_monthly: 500
---
### Audit finding & rationale
Low priority high savings.`
    )

    await fs.writeFile(
      path.join(recDir, "rec-high-small.md"),
      `---
id: "rec-high-small"
priority: "high"
potential_savings_monthly: 20
---
### Audit finding & rationale
High priority small savings.`
    )

    await fs.writeFile(
      path.join(recDir, "rec-high-big.md"),
      `---
id: "rec-high-big"
priority: "high"
potential_savings_monthly: 100
---
### Audit finding & rationale
High priority big savings.`
    )

    const sorted = await listRecommendations(tmpDir)
    expect(sorted.map(r => r.id)).toEqual(["rec-high-big", "rec-high-small", "rec-low"])
  })

  it("handles non-existent recommendations directory gracefully", async () => {
    const empty = await listRecommendations(path.join(tmpDir, "does-not-exist"))
    expect(empty).toEqual([])
  })

  it("returns null for invalid frontmatter or missing fences", () => {
    expect(parseRecommendation("not frontmatter", "test.md")).toBeNull()
    expect(parseRecommendation("---\nid: 1\nno end delimiter", "test.md")).toBeNull()
    expect(parseRecommendation("---\n[invalid yaml: {:\n---", "test.md")).toBeNull()
  })

  it("robustly parses potentialSavingsMonthly with currency symbols, commas, and edge cases", () => {
    const recFormatted = parseRecommendation(
      `---
id: "rec-curr"
title: "Savings"
potential_savings_monthly: "$150,000.50"
---
Body`,
      "rec-curr.md"
    )
    expect(recFormatted?.potentialSavingsMonthly).toBe(150000.5)

    const recComma = parseRecommendation(
      `---
id: "rec-comma"
title: "Savings"
potential_savings_monthly: "15,000"
---
Body`,
      "rec-comma.md"
    )
    expect(recComma?.potentialSavingsMonthly).toBe(15000)

    const recInvalid = parseRecommendation(
      `---
id: "rec-inv"
title: "Savings"
potential_savings_monthly: "N/A"
---
Body`,
      "rec-inv.md"
    )
    expect(recInvalid?.potentialSavingsMonthly).toBe(0)
  })

  it("updates frontmatter status strictly within frontmatter and preserves body text", () => {
    const content = `---
id: "rec-test"
status: "pending"
priority: "high"
---
### Audit finding & rationale
Note: The status: pending here and status: "proposed" must not be modified.`

    const updated = updateFrontmatterStatus(content, "approved")
    expect(updated).toContain('status: "approved"')
    expect(updated).toContain('Note: The status: pending here and status: "proposed" must not be modified.')
  })
})
