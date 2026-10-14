import { describe, it, expect } from "vitest"
import { DEPARTMENT_COMMANDS } from "./commands"
import { getCompanyCommand } from "@/lib/company-commands/registry"

describe("Department Agent Gate Enforcement (spec invariant)", () => {
  it("enforces the Money gate row on funnel and finance agents", () => {
    const funnelCmd = getCompanyCommand("sync-funnel")
    const financeCmd = getCompanyCommand("sync-finances")

    expect(funnelCmd).toBeDefined()
    expect(financeCmd).toBeDefined()

    const funnelPrompt = funnelCmd!.buildPrompt({}, "2026-09-10", "")
    const financePrompt = financeCmd!.buildPrompt({}, "2026-09-10", "")

    // Money row rule: drafting price quotes, discounts, contracts, or spend
    // must halt at the gate without outward commitment
    expect(funnelPrompt).toMatch(/gate/i)
    expect(funnelPrompt).toMatch(/draft/i)
    expect(funnelPrompt).toMatch(/do not send/i)

    expect(financePrompt).toMatch(/gate/i)
    expect(financePrompt).toMatch(/stop/i)
    expect(financePrompt).toMatch(/do not initiate/i)
  })

  it("enforces the Publication gate row on social and content agents", () => {
    const socialCmd = getCompanyCommand("sync-social")
    const contentCmd = getCompanyCommand("sync-content")

    expect(socialCmd).toBeDefined()
    expect(contentCmd).toBeDefined()

    const socialPrompt = socialCmd!.buildPrompt({}, "2026-09-10", "")
    const contentPrompt = contentCmd!.buildPrompt({}, "2026-09-10", "")

    // Publication row rule: anything leaving the company (posts, tweets,
    // articles) must never be published without human approval
    expect(socialPrompt).toMatch(/gate/i)
    expect(socialPrompt).toMatch(/never publish/i)
    expect(socialPrompt).toMatch(/read-only/i)

    expect(contentPrompt).toMatch(/gate/i)
    expect(contentPrompt).toMatch(/never publish/i)
    expect(contentPrompt).toMatch(/human confirmation/i)
  })

  it("ensures every department command outputs exclusively to the records/ tree without committing", () => {
    for (const cmd of DEPARTMENT_COMMANDS) {
      expect(cmd.outputKind).toBe("known-file")
      expect(cmd.outputPath).toMatch(/^records\/[a-z]+\/[a-z_]+\.yaml$/)

      const prompt = cmd.buildPrompt({}, "2026-09-10", "")
      // Agent must never commit on its own; diffs land in the gate
      expect(prompt).toMatch(/do not run any commands or commit/i)
    }
  })
})
