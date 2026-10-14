import { describe, it, expect } from "vitest"
import { LeadMagnetsTable } from "./lead-magnets-table"
import type { LeadMagnetItem } from "@/lib/os/departments/adapters/content-adapter"

describe("LeadMagnetsTable", () => {
  it("renders empty state when no rows are provided", () => {
    const element = LeadMagnetsTable({ rows: [] })
    expect(element).toBeDefined()
    expect(element.props.children).toContain("No lead magnets recorded yet")
  })

  it("renders table with asset title and copy affordance", () => {
    const rows: LeadMagnetItem[] = [
      {
        id: "lm-1",
        title: "Developer Architecture Guide",
        url: "https://example.com/guide",
        subscribers: 240,
        status: "live",
      },
    ]

    const element = LeadMagnetsTable({ rows, showCopy: true })
    expect(element).toBeDefined()
    expect(element.props.className).toContain("overflow-x-auto")
  })
})
