import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"
import { summariseChange } from "./change-summary"

/**
 * The REAL bundled ontology, not a fixture.
 *
 * The first version of this suite invented `bottleneck: chasing invoices` — a
 * flat top-level key that exists in no company.yaml anywhere. Seven tests went
 * green while the function returned "Rewrites some text, same number of lines."
 * for every real edit to that file, which is the one case the summary was built
 * for. A synthetic fixture cannot catch that; reading the shipped template can.
 */
const REAL_ONTOLOGY = fs.readFileSync(
  // The starter scaffold has no company.yaml — /define-company writes it. The
  // shipped pack ontologies are the real nested shape this has to handle.
  path.join(process.cwd(), "templates/packs/marketing/definitions/ontology/company.yaml"),
  "utf-8"
)

describe("summariseChange", () => {
  it("says what a brand-new file is", () => {
    expect(summariseChange("", "leads: []\n", "records/funnel/leads.yaml")).toEqual([
      "Creates leads.yaml.",
    ])
  })

  it("counts added and removed list entries in plain words", () => {
    const before = "leads:\n  - id: a\n    name: Ada\n"
    const after = "leads:\n  - id: a\n    name: Ada\n  - id: k\n    name: Kofi\n"
    expect(summariseChange(before, after, "records/funnel/leads.yaml").join(" ")).toContain("Adds 1 entry")
  })

  it("names a nested fact changed in the real bundled ontology", () => {
    const first = /^\s{2,}(\w[\w-]*): (.+)$/m.exec(REAL_ONTOLOGY)
    expect(first, "the bundled ontology has no nested key: value line").not.toBeNull()
    const after = REAL_ONTOLOGY.replace(first![0], first![0].replace(first![2], "something else entirely"))

    const lines = summariseChange(REAL_ONTOLOGY, after, "definitions/ontology/company.yaml")

    expect(lines.join(" ")).toContain(first![1])
    expect(lines.join(" ")).toContain("something else entirely")
    expect(lines.join(" ")).not.toContain("Rewrites some text")
  })

  it("tells two same-named fields apart by their parents", () => {
    // A real ontology has `name:` under customer, under org, under product.
    // Keyed on the bare word they collide: one change is reported against the
    // wrong section, or silently lost to whichever was seen first.
    const before = "customer:\n  name: Ada\norg:\n  name: Acme\n"
    const after = "customer:\n  name: Ada\norg:\n  name: Beta\n"

    const line = summariseChange(before, after, "definitions/ontology/company.yaml").join(" ")

    expect(line).toContain("org")
    expect(line).toContain("Beta")
    expect(line).not.toContain("Ada")
  })

  it("does not double the quotes on a value that is already quoted", () => {
    const before = 'meta:\n  name: "Old Name"\n'
    const after = 'meta:\n  name: "New Name"\n'
    const line = summariseChange(before, after, "definitions/ontology/company.yaml").join(" ")
    expect(line).not.toContain('""')
    expect(line).toContain("New Name")
  })

  it("does not call markdown bullets entries", () => {
    // "- point one" under a heading is prose, not a record. Calling three
    // bullets "Adds 3 entries" misreads a digest as a ledger.
    const before = "# Digest\n\nnothing yet\n"
    const after = "# Digest\n\n- point one\n- point two\n- point three\n"
    expect(summariseChange(before, after, "notes/company/digests/x.md").join(" ")).not.toContain("entries")
  })

  it("names a changed top-level value, with both sides", () => {
    const before = "bottleneck: chasing invoices\n"
    const after = "bottleneck: hiring a second chef\n"
    const lines = summariseChange(before, after, "definitions/ontology/company.yaml")
    expect(lines.join(" ")).toContain("bottleneck")
    expect(lines.join(" ")).toContain("chasing invoices")
    expect(lines.join(" ")).toContain("hiring a second chef")
  })

  it("does not print a wall of keys for a large rewrite", () => {
    const before = Array.from({ length: 40 }, (_, i) => `k${i}: old${i}`).join("\n")
    const after = Array.from({ length: 40 }, (_, i) => `k${i}: new${i}`).join("\n")
    const lines = summariseChange(before, after, "definitions/ontology/company.yaml")
    expect(lines.length).toBeLessThanOrEqual(6)
    expect(lines.join(" ")).toMatch(/\d+ more/)
  })

  it("falls back to line counts for a file that is not key-shaped", () => {
    const before = "# Notes\n\nfirst thought\n"
    const after = "# Notes\n\nfirst thought\nsecond thought\n"
    expect(summariseChange(before, after, "notes/company/digests/x.md").join(" ")).toMatch(/1 line/)
  })

  it("is honest when nothing actually differs", () => {
    expect(summariseChange("same\n", "same\n", "x.md")).toEqual(["No changes."])
  })

  it("never returns an empty list, because the caller renders it above the diff", () => {
    const cases: Array<[string, string]> = [
      ["", ""],
      ["a", "b"],
      ["key: 1\n", ""],
    ]
    for (const [a, b] of cases) {
      expect(summariseChange(a, b, "f.yaml").length).toBeGreaterThan(0)
    }
  })
})
