import { describe, it, expect } from "vitest"
import {
  AUDIT_FINANCES_COMMAND,
  AUDIT_FINANCES_COMMAND_ID,
  RECOMMENDATIONS_DIR,
  buildAuditFinancesPrompt,
} from "./audit-finances-command"
import { COMPANY_COMMANDS_REGISTRY } from "@/lib/company-commands/registry"

describe("audit-finances command", () => {
  it("defines command constants correctly", () => {
    expect(AUDIT_FINANCES_COMMAND_ID).toBe("audit-finances")
    expect(RECOMMENDATIONS_DIR).toBe("notes/finances/recommendations")
    expect(AUDIT_FINANCES_COMMAND.id).toBe("audit-finances")
    expect(AUDIT_FINANCES_COMMAND.untrustedInput).toBe(true)
  })

  it("builds prompt incorporating cash balance and monthly burn", () => {
    const prompt = buildAuditFinancesPrompt({
      cashBalance: 150000,
      monthlyBurn: 15000,
      prompt: "Focus on cloud compute and SaaS",
      statementText: "Figma,45\nAWS,300",
    })
    expect(prompt).toContain("$150,000")
    expect(prompt).toContain("$15,000")
    expect(prompt).toContain("Focus on cloud compute and SaaS")
    expect(prompt).toContain(RECOMMENDATIONS_DIR)
    expect(prompt).toContain("notes/finances/recommendations/")
    expect(prompt).toContain("AGENTS.md §6 Money and Publication gate")
  })

  it("parses currency strings like $150,000 and 15,000 cleanly in command buildPrompt", () => {
    const prompt = AUDIT_FINANCES_COMMAND.buildPrompt({
      cashBalance: "$150,000",
      monthlyBurn: "15,000",
      prompt: "Find savings",
    })
    expect(prompt).toContain("Current cash balance on hand: $150,000")
    expect(prompt).toContain("Current estimated monthly burn: $15,000")
    expect(prompt).toContain("AGENTS.md §6 Money and Publication gate")
  })

  it("is registered in the company commands registry", () => {
    const found = COMPANY_COMMANDS_REGISTRY.find((cmd) => cmd.id === AUDIT_FINANCES_COMMAND_ID)
    expect(found).toBeDefined()
    expect(found?.label).toBe("Audit spend & cash runway")
  })
})
