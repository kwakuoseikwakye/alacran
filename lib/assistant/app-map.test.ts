import { describe, it, expect } from "vitest"
import path from "node:path"
import { buildAppMapBlock, pageSlugFromPath } from "./app-map"
import { NAV_GROUPS } from "../os/nav"
import { readPulse, formatCompanyContext, type CompanyContext } from "./gather-all-companies"
import type { Agent } from "../adapters/types"

describe("buildAppMapBlock", () => {
  it("names every nav destination, so no page is claimed not to exist", () => {
    const block = buildAppMapBlock()
    for (const item of NAV_GROUPS.flatMap((g) => g.items)) expect(block).toContain(item.label)
  })

  it("explains that drafts need approval and the app never sends", () => {
    const block = buildAppMapBlock()
    expect(block).toContain("only an approval saves it")
    expect(block).toContain("never sends")
  })

  it("says which page the person asked from", () => {
    expect(buildAppMapBlock("/c/acme/comms", "Acme")).toContain("on the Communications & inquiries page of Acme")
    expect(buildAppMapBlock()).not.toContain("Right now")
  })
})

describe("pageSlugFromPath", () => {
  it("reads company and machine-wide routes", () => {
    expect(pageSlugFromPath("/c/acme/finances")).toBe("finances")
    expect(pageSlugFromPath("/c/acme")).toBe("dashboard")
    expect(pageSlugFromPath("/settings?x=1")).toBe("settings")
    expect(pageSlugFromPath(undefined)).toBeNull()
  })
})

describe("readPulse inquiries", () => {
  const card = (status: string) => `---\nid: "inq-1"\nfrom: "Ama"\nsubject: "Invoice"\nstatus: "${status}"\n---\n### Draft reply\nHi.`
  const agent = { id: "acme", rootPath: "/co" } as Agent
  const dir = path.join("/co", "notes/comms/inquiries")
  const files: Record<string, string> = {
    [path.join(dir, "a.md")]: card("pending"),
    [path.join(dir, "b.md")]: card("approved"),
    [path.join(dir, "c.md")]: card("replied"),
  }
  const readFile = async (p: string) => {
    if (p in files) return files[p]
    throw new Error("missing")
  }
  const readDir = async (p: string) => (p === dir ? ["a.md", "b.md", "c.md"] : [])

  it("counts cards not yet marked replied, and shows them in the prompt", async () => {
    const pulse = await readPulse(agent, [], readFile, readDir)
    expect(pulse?.inquiriesWaiting).toBe(2)
    const ctx: CompanyContext = { id: "acme", name: "Acme", kind: "command-set", source: "name-only", text: "", truncated: false, pulse }
    expect(formatCompanyContext([ctx])).toContain("Inquiries waiting on a reply: 2")
  })
})
