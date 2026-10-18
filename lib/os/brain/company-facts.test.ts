import { describe, expect, it } from "vitest"
import { readCompanyFacts } from "./company-facts"

const YAML = `meta:
  version: 1
customer:
  segments:
    - id: bakers
      name: "Bakers"
    - id: cafes
      name: "Cafes"
product:
  offerings:
    - id: box
      name: "Bread box"
  bottleneck: "Oven capacity" # unconfirmed: one oven
`

describe("readCompanyFacts", () => {
  it("one fact per list item and per scalar field, skipping meta", () => {
    const facts = readCompanyFacts(YAML)
    expect(facts.map((f) => f.id)).toEqual([
      "yaml:customer.segments.0",
      "yaml:customer.segments.1",
      "yaml:product.offerings.0",
      "yaml:product.bottleneck",
    ])
    expect(facts.map((f) => f.label)).toEqual(["Bakers", "Cafes", "Bread box", "bottleneck"])
    expect(facts[3].keyPath).toBe("product.bottleneck")
    expect(facts[3].summary).toBe("Oven capacity")
  })

  it("flags a trailing # unconfirmed comment and <<TODO>> as unsure", () => {
    const withTodo = YAML.replace('name: "Cafes"', 'name: "<<TODO>>"')
    const unsure = Object.fromEntries(readCompanyFacts(withTodo).map((f) => [f.id, f.unsure]))
    expect(unsure).toEqual({
      "yaml:customer.segments.0": false,
      "yaml:customer.segments.1": true,
      "yaml:product.offerings.0": false,
      "yaml:product.bottleneck": true,
    })
  })

  it("flags an item whose unconfirmed comment sits on its last field", () => {
    const facts = readCompanyFacts(`team:\n  roles:\n    - id: a\n      name: "A" # unconfirmed\n    - id: b\n      name: "B"\n`)
    expect(facts.map((f) => f.unsure)).toEqual([true, false])
  })

  it("label falls back through name, channel, step, decision, id, then the last key", () => {
    const facts = readCompanyFacts(`ops:
  a:
    - channel: "Email"
      id: x
  b:
    - step: "Bake"
  c:
    - decision: "Hire"
  d:
    - id: only-id
  e:
    - other: 1
`)
    expect(facts.map((f) => f.label)).toEqual(["Email", "Bake", "Hire", "only-id", "e"])
  })

  it("summary takes the first of promise, job_to_be_done, notes, owns and clips to 140", () => {
    const long = "x".repeat(200)
    const facts = readCompanyFacts(`product:
  offerings:
    - name: A
      notes: "later"
      promise: "Fresh daily"
    - name: B
      notes: "${long}"
    - name: C
`)
    expect(facts[0].summary).toBe("Fresh daily")
    expect(facts[1].summary).toHaveLength(140)
    expect(facts[1].summary.endsWith("…")).toBe(true)
    expect(facts[2].summary).toBe("")
  })

  it("returns [] for unparsable or empty yaml", () => {
    expect(readCompanyFacts("::: bad")).toEqual([])
    expect(readCompanyFacts("")).toEqual([])
  })
})
