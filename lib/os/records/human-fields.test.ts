import { describe, expect, it } from "vitest"
import { humanFieldChanges } from "./human-fields"

const file = (records: string, fields = "[notes]") => `schema_version: 1\nhuman_fields: ${fields}\nrecords:\n${records}`

describe("humanFieldChanges", () => {
  it("allows machine fields to change and rows to be added or reordered", () => {
    const before = file("  - { id: a, stage: new, notes: hi }\n  - { id: b, stage: new }\n")
    const after = file("  - { id: c, stage: new }\n  - { id: b, stage: won }\n  - { id: a, stage: qualified, notes: hi }\n")
    expect(humanFieldChanges("records/leads.yaml", before, after)).toEqual([])
  })

  it("matches by id, so a shifted row never reads as someone else's note changing", () => {
    const before = file("  - { id: a, notes: call Ama }\n  - { id: b, notes: call Kofi }\n")
    const after = file("  - { id: new, notes: '' }\n  - { id: a, notes: call Ama }\n  - { id: b, notes: call Kofi }\n")
    expect(humanFieldChanges("records/leads.yaml", before, after)).toEqual([])
  })

  it("flags a changed human field, a changed or removed human-owned record, and an edited field list", () => {
    const before = file("  - { id: a, notes: hi }\n  - { id: h, owner: human, stage: new }\n  - { id: g, owner: human }\n")
    const after = file("  - { id: a, notes: bye }\n  - { id: h, owner: human, stage: won }\n", "[]")
    expect(humanFieldChanges("records/leads.yaml", before, after)).toEqual([
      "records/leads.yaml: the list of human-owned fields changed.",
      "records/leads.yaml: changed notes on a, which people write.",
      "records/leads.yaml: changed h, which a person owns.",
      "records/leads.yaml: removed g, which a person owns.",
    ])
  })

  it("ignores files outside records/ and new files, and refuses one that stops parsing", () => {
    expect(humanFieldChanges("notes/x.yaml", file("  - { id: a, notes: hi }\n"), "")).toEqual([])
    expect(humanFieldChanges("records/leads.yaml", "", file("  - { id: a }\n"))).toEqual([])
    expect(humanFieldChanges("records/leads.yaml", file("  - { id: a }\n"), "records: [unclosed")).toEqual(["records/leads.yaml no longer reads as YAML."])
  })
})
