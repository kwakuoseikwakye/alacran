import { describe, it, expect, beforeEach, vi } from "vitest"
import { readOntology } from "./read"
import { clearFileMemo } from "../file-memo"

const VALID = `
meta:
  version: 1
  updated: "2026-09-04"
customer:
  segments:
    - id: "smb"
      name: "Small business owners"
      job_to_be_done: "Give agents durable memory."
      alternative: "Retyping context."
  acquisition:
    - channel: "GitHub"
      notes: "Direct downloads."
org:
  roles:
    - id: "lead"
      name: "Technical Lead"
      owns: "Architecture and releases."
  decisions:
    - decision: "Publishing releases"
      approver: "lead"
product:
  offerings:
    - id: "desktop"
      name: "Desktop app"
      promise: "Runs locally."
      pricing: "Free."
  value_flow:
    - step: "Install the app"
      owner: "lead"
  bottleneck: "Onboarding"
`

describe("readOntology", () => {
  beforeEach(() => clearFileMemo())

  it("parses the canonical three-domain shape", async () => {
    const read = vi.fn().mockResolvedValue(VALID)
    const stat = vi.fn().mockResolvedValue({ mtimeMs: 1 })
    const result = await readOntology("/co", read, stat)
    if (!result.ok) throw new Error(result.message)
    expect(result.ontology.customer.segments[0].id).toBe("smb")
    expect(result.ontology.org.roles).toHaveLength(1)
    expect(result.ontology.product.bottleneck).toBe("Onboarding")
  })

  it("reads from definitions/ontology/company.yaml under the company root", async () => {
    const read = vi.fn().mockResolvedValue(VALID)
    const stat = vi.fn().mockResolvedValue({ mtimeMs: 1 })
    await readOntology("/co", read, stat)
    expect(read).toHaveBeenCalledWith("/co/definitions/ontology/company.yaml")
  })

  it("fails loud on a missing required domain", async () => {
    const read = vi.fn().mockResolvedValue("meta:\n  version: 1\n")
    const stat = vi.fn().mockResolvedValue({ mtimeMs: 1 })
    const result = await readOntology("/co", read, stat)
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected failure")
    expect(result.message).toMatch(/customer/)
  })

  it("reports a missing file as not-configured rather than throwing", async () => {
    const read = vi.fn().mockRejectedValue(Object.assign(new Error("no"), { code: "ENOENT" }))
    const stat = vi.fn().mockRejectedValue(Object.assign(new Error("no"), { code: "ENOENT" }))
    const result = await readOntology("/co", read, stat)
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected failure")
    expect(result.message).toMatch(/no ontology/i)
  })

  it("rejects unparseable YAML with a clear message", async () => {
    const read = vi.fn().mockResolvedValue("customer: [unclosed")
    const stat = vi.fn().mockResolvedValue({ mtimeMs: 1 })
    const result = await readOntology("/co", read, stat)
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error("expected failure")
    expect(result.message).toMatch(/could not parse/i)
  })
})
