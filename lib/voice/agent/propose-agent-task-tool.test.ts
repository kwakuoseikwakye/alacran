import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { runProposeAgentTaskTool } from "./propose-agent-task-tool"

const companies = [
  { id: "acme", name: "Acme Studio" },
  { id: "beta", name: "Beta Labs" },
]
const ctx = (scope = "acme") => ({ scope, companies })

describe("runProposeAgentTaskTool", () => {
  it("returns a delegate_task proposal for the dock's company with the sanitised text", () => {
    const out = runProposeAgentTaskTool({ task: "  Draft the Q4 proposal\nand keep it short  " }, ctx())
    expect(out.proposal).toEqual({
      companyId: "acme",
      commandId: "delegate-task",
      actionType: "delegate_task",
      label: "Send to Acme Studio's agent",
      fields: { task: "Draft the Q4 proposal and keep it short" },
      rationale: "Typed into the owner's agent exactly as shown.",
    })
    expect(out.text).toMatch(/A proposal is on screen for the owner to approve\. It is not done yet\. Say so\.$/)
  })

  it("never echoes the task in the reply text", () => {
    const out = runProposeAgentTaskTool({ task: "secret plan details" }, ctx())
    expect(out.text).not.toContain("secret plan details")
  })

  it("keeps control characters out of the proposal", () => {
    const out = runProposeAgentTaskTool({ task: "go\u001b[200~now\u0007" }, ctx())
    expect(out.proposal?.fields.task).not.toMatch(/[\u0000-\u001f\u007f-\u009f]/)
  })

  it("asks again, with no proposal, for a blank or non-string task", () => {
    for (const task of ["", "   \n ", 42, undefined]) {
      const out = runProposeAgentTaskTool({ task }, ctx())
      expect(out.proposal).toBeNull()
      expect(out.text).toMatch(/Do not guess/)
    }
  })

  it("lists the companies for an unknown name and builds no proposal", () => {
    const out = runProposeAgentTaskTool({ task: "x", company: "Nope" }, ctx())
    expect(out.proposal).toBeNull()
    expect(out.text).toContain("Beta Labs")
  })

  it("never sends or runs anything: the file does not mention the send or run code", () => {
    const source = readFileSync(new URL("./propose-agent-task-tool.ts", import.meta.url), "utf-8")
    expect(source).not.toMatch(/runCompanyCommand|run-company-command|delegate-task-impl|session\.write|fetch\(/)
  })

  describe("auto-dispatch", () => {
    const on = (extra: object = {}) => ({ ...ctx(), autoDispatch: ["acme"], nonce: () => "n-1", ...extra })

    it("returns a strip proposal for a switched-on company and a clean task", () => {
      const out = runProposeAgentTaskTool({ task: "tidy the headings in notes" }, on())
      expect(out.proposal).toEqual({
        companyId: "acme",
        commandId: "delegate-task",
        actionType: "delegate_task",
        label: "Sending to Acme Studio's agent",
        fields: { task: "tidy the headings in notes", auto: "1", nonce: "n-1" },
        rationale: "Typed into the owner's agent after a short cancel window.",
      })
      expect(out.text).toMatch(/sending to the agent in 5 seconds/)
      expect(out.text).toMatch(/cancel/)
      expect(out.text).toMatch(/not done yet/i)
    })

    it("keeps the card for a gated task, even when the company is switched on", () => {
      const out = runProposeAgentTaskTool({ task: "pay the Acme invoice" }, on())
      expect(out.proposal?.fields).toEqual({ task: "pay the Acme invoice" })
      expect(out.proposal?.label).toBe("Send to Acme Studio's agent")
    })

    it("keeps the card when the company is not switched on", () => {
      const out = runProposeAgentTaskTool({ task: "tidy the headings in notes" }, on({ autoDispatch: ["beta"] }))
      expect(out.proposal?.fields).toEqual({ task: "tidy the headings in notes" })
    })

    it("keeps the card when the switch list is missing or empty", () => {
      expect(runProposeAgentTaskTool({ task: "tidy the headings" }, ctx()).proposal?.fields).toEqual({ task: "tidy the headings" })
      expect(runProposeAgentTaskTool({ task: "tidy the headings" }, on({ autoDispatch: [] })).proposal?.fields).toEqual({
        task: "tidy the headings",
      })
    })

    // Review focus 4: a second task while one is counting down falls back to the card.
    it("keeps the card while another dispatch is counting down", () => {
      const out = runProposeAgentTaskTool({ task: "tidy the headings" }, on({ dispatchBusy: true }))
      expect(out.proposal?.fields).toEqual({ task: "tidy the headings" })
    })

    it("checks the switch for the company the owner named, not the dock's", () => {
      const out = runProposeAgentTaskTool({ task: "tidy the headings", company: "Beta Labs" }, on({ autoDispatch: ["beta"] }))
      expect(out.proposal?.companyId).toBe("beta")
      expect(out.proposal?.fields.auto).toBe("1")
    })

    it("gives each strip its own nonce by default", () => {
      const a = runProposeAgentTaskTool({ task: "tidy the headings" }, { ...ctx(), autoDispatch: ["acme"] })
      const b = runProposeAgentTaskTool({ task: "tidy the headings" }, { ...ctx(), autoDispatch: ["acme"] })
      expect(a.proposal?.fields.nonce).toBeTruthy()
      expect(a.proposal?.fields.nonce).not.toBe(b.proposal?.fields.nonce)
    })

    it("never echoes the task in the reply text", () => {
      const out = runProposeAgentTaskTool({ task: "secret plan details" }, on())
      expect(out.text).not.toContain("secret plan details")
    })
  })
})
