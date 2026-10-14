import { describe, expect, it } from "vitest"
import { describeProfile } from "./profile-preview"

const PATH = "definitions/ontology/company.yaml"

const FULL = `version: 1
company_summary:
  name: Sweet Loaf
  domain: A neighbourhood bakery
  employee_count: 4
  primary_bottleneck: Custom cake orders arrive by DM and get lost
stakeholders:
  - role: Owner
    position: Sets prices and approves big orders
  - role: Baker
    position: Bakes to the daily list
value_flow:
  input: Orders
  transform: Baking and decorating
  output: Fresh cakes handed over
customer:
  segments: []
`

describe("describeProfile", () => {
  it("says the wizard's answers as sentences, not key: value lines", () => {
    const text = describeProfile(PATH, FULL)
    expect(text).toContain("Your business: A neighbourhood bakery")
    expect(text).toContain("People: 4")
    expect(text).toContain("Biggest bottleneck: Custom cake orders arrive by DM and get lost")
    expect(text).toContain("Owner (Sets prices and approves big orders)")
    expect(text).toContain("Baker (Bakes to the daily list)")
    expect(text).toContain("How work flows: Orders, then Baking and decorating, then Fresh cakes handed over.")
    expect(text).not.toContain("company_summary")
  })

  it("says it is a summary, so a person knows the full file has more", () => {
    expect(describeProfile(PATH, FULL)).toMatch(/Technical details/)
  })

  it("leaves out answers that are empty instead of printing blanks", () => {
    const text = describeProfile(PATH, "company_summary:\n  domain: Bakery\n")
    expect(text).toContain("Your business: Bakery")
    expect(text).not.toMatch(/People:|bottleneck|How work flows|Who is involved/)
  })

  it("only handles the company profile", () => {
    expect(describeProfile("notes/company/x.md", FULL)).toBeNull()
  })

  it("returns null when the text is not a profile it can read, so the caller shows the raw text", () => {
    expect(describeProfile(PATH, "a: [unclosed")).toBeNull()
    expect(describeProfile(PATH, "just some prose")).toBeNull()
    // a starter pack's example file has no company_summary yet
    expect(describeProfile(PATH, "customer:\n  segments: []\n")).toBeNull()
    // parsed fine but nothing describes a business
    expect(describeProfile(PATH, "company_summary:\n  name: X\n")).toBeNull()
  })
})
