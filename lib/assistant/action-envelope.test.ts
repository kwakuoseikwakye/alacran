import { describe, expect, it } from "vitest"
import { parseActionProposal } from "./action-envelope"

describe("parseActionProposal", () => {
  it("returns unchanged text and null proposal when no tags are present", () => {
    const text = "Good morning Alex. Everything is on track."
    const result = parseActionProposal(text)
    expect(result.speech).toBe(text)
    expect(result.proposal).toBeNull()
  })

  it("handles empty or whitespace text", () => {
    expect(parseActionProposal("")).toEqual({ speech: "", proposal: null })
    expect(parseActionProposal("   ")).toEqual({ speech: "", proposal: null })
  })

  it("extracts a valid action proposal and cleans speech", () => {
    const raw = `I've prepared that decision for Acme. Review the card below to run it.
<action_proposal>
{
  "companyId": "acme",
  "commandId": "decision",
  "label": "Record SQLite WAL Decision",
  "fields": {
    "context": "Local-first storage",
    "decision": "Use SQLite with WAL mode"
  },
  "rationale": "Matches proven architecture"
}
</action_proposal>`

    const result = parseActionProposal(raw)
    expect(result.speech).toBe("I've prepared that decision for Acme. Review the card below to run it.")
    expect(result.proposal).toEqual({
      companyId: "acme",
      commandId: "decision",
      label: "Record SQLite WAL Decision",
      fields: {
        context: "Local-first storage",
        decision: "Use SQLite with WAL mode",
      },
      rationale: "Matches proven architecture",
    })
  })

  it("handles markdown code fences inside action_proposal tag", () => {
    const raw = `Drafted!
<action_proposal>
\`\`\`json
{
  "companyId": "betacorp",
  "commandId": "digest",
  "label": "Weekly Digest",
  "fields": {
    "period": "last 7 days"
  }
}
\`\`\`
</action_proposal>`

    const result = parseActionProposal(raw)
    expect(result.speech).toBe("Drafted!")
    expect(result.proposal).toEqual({
      companyId: "betacorp",
      commandId: "digest",
      label: "Weekly Digest",
      fields: {
        period: "last 7 days",
      },
      rationale: undefined,
    })
  })

  it("handles case-insensitive tags", () => {
    const raw = `Speaking to you.
<ACTION_PROPOSAL>
{
  "companyId": "acme",
  "commandId": "digest",
  "fields": {}
}
</ACTION_PROPOSAL>`

    const result = parseActionProposal(raw)
    expect(result.speech).toBe("Speaking to you.")
    expect(result.proposal?.companyId).toBe("acme")
    expect(result.proposal?.commandId).toBe("digest")
    expect(result.proposal?.label).toBe("digest") // defaults to commandId when label omitted
  })

  it("gracefully recovers from malformed JSON by dropping proposal and keeping clean speech", () => {
    const raw = `Here is my answer.
<action_proposal>
{
  "companyId": "acme", broken-json:
}
</action_proposal>`

    const result = parseActionProposal(raw)
    expect(result.speech).toBe("Here is my answer.")
    expect(result.proposal).toBeNull()
  })

  it("rejects objects missing companyId or commandId", () => {
    const raw = `Answer.
<action_proposal>
{
  "label": "Something",
  "fields": {}
}
</action_proposal>`

    const result = parseActionProposal(raw)
    expect(result.speech).toBe("Answer.")
    expect(result.proposal).toBeNull()
  })

  it("identifies direct record creation action types", () => {
    const rawLead = `I found a new sales prospect!
<action_proposal>
{
  "companyId": "alacran-app",
  "commandId": "create_lead",
  "label": "Add Lead: Pied Piper ($25,000)",
  "fields": {
    "name": "Pied Piper",
    "value": "25000",
    "stage": "discovery",
    "contact": "richard@piedpiper.com"
  }
}
</action_proposal>`

    const parsedLead = parseActionProposal(rawLead)
    expect(parsedLead.proposal?.actionType).toBe("create_lead")
    expect(parsedLead.proposal?.fields.name).toBe("Pied Piper")

    const rawTxn = `Expense noted.
<action_proposal>
{
  "companyId": "alacran-app",
  "commandId": "create_transaction",
  "label": "Log Hosting Expense",
  "fields": {
    "date": "2026-09-19",
    "amount": "120.50",
    "type": "expense",
    "description": "AWS Cloud",
    "account": "Operating"
  }
}
</action_proposal>`

    const parsedTxn = parseActionProposal(rawTxn)
    expect(parsedTxn.proposal?.actionType).toBe("create_transaction")
    expect(parsedTxn.proposal?.fields.amount).toBe("120.50")
  })

  it("recognises edit_department, remove_department and verify, and leaves unknown ids as plain commands", () => {
    const wrap = (obj: object) => `Sure.<action_proposal>${JSON.stringify(obj)}</action_proposal>`
    const edit = parseActionProposal(wrap({ companyId: "acme", commandId: "edit_department", actionType: "edit_department", label: "Change Sales", fields: { slug: "sales", name: "Revenue" } }))
    expect(edit.proposal?.actionType).toBe("edit_department")
    expect(edit.proposal?.fields.slug).toBe("sales")
    expect(parseActionProposal(wrap({ companyId: "acme", commandId: "remove_department", label: "Remove Events", fields: { slug: "events" } })).proposal?.actionType).toBe("remove_department")
    expect(parseActionProposal(wrap({ companyId: "acme", commandId: "verify", label: "Run the checks", fields: {} })).proposal?.actionType).toBe("verify")
    expect(parseActionProposal(wrap({ companyId: "acme", commandId: "check-inbox", label: "Inbox", fields: {} })).proposal?.actionType).toBeUndefined()
  })

  it("keeps delegate_task, check-inbox and handoff from company-AI text as plain commands, and accepts the hyphen aliases", () => {
    const wrap = (obj: object) => `Sure.<action_proposal>${JSON.stringify(obj)}</action_proposal>`
    // delegate_task is built only by the voice handler, so company text can never make it a kind.
    expect(parseActionProposal(wrap({ companyId: "acme", commandId: "digest", actionType: "delegate_task", label: "Hand off", fields: {} })).proposal?.actionType).toBeUndefined()
    expect(parseActionProposal(wrap({ companyId: "acme", commandId: "digest", kind: "delegate_task", label: "Hand off", fields: {} })).proposal?.actionType).toBeUndefined()
    expect(parseActionProposal(wrap({ companyId: "acme", commandId: "delegate_task", label: "Hand off", fields: {} })).proposal?.actionType).toBeUndefined()
    expect(parseActionProposal(wrap({ companyId: "acme", commandId: "handoff", label: "Handoff", fields: {} })).proposal?.actionType).toBeUndefined()
    expect(parseActionProposal(wrap({ companyId: "acme", commandId: "check-inbox", label: "Inbox", fields: {} })).proposal?.actionType).toBeUndefined()
    expect(parseActionProposal(wrap({ companyId: "acme", commandId: "edit-department", label: "Change", fields: { slug: "sales" } })).proposal?.actionType).toBe("edit_department")
    expect(parseActionProposal(wrap({ companyId: "acme", commandId: "remove-department", label: "Remove", fields: { slug: "events" } })).proposal?.actionType).toBe("remove_department")
  })
})


describe("create_department proposals", () => {
  const raw = (extra = "") => `Sure.\n<action_proposal>\n{"companyId":"acme","commandId":"create_department","label":"Add Legal","fields":{"name":"Legal","purpose":"Contracts.","color":"#0369a1"}${extra}}\n</action_proposal>`
  it("is recognised from the command id alone", () => {
    const { proposal, speech } = parseActionProposal(raw())
    expect(speech).toBe("Sure.")
    expect(proposal).toMatchObject({ companyId: "acme", actionType: "create_department", fields: { name: "Legal", purpose: "Contracts.", color: "#0369a1" } })
  })
  it("also from actionType, and aliases", () => {
    expect(parseActionProposal(raw(',"actionType":"add_department"')).proposal?.actionType).toBe("create_department")
  })
})

describe("delegate_task is never inferred from assistant text", () => {
  // The owner-approved task card is built only by the voice tool; a model's text proposal must not
  // be able to claim that kind, and with it the card's send path.
  it.each([
    { actionType: "delegate_task" },
    { actionType: "delegate-task" },
    { commandId: "delegate_task" },
    { commandId: "delegate-task" },
    { kind: "delegate_task" },
    { actionType: "delegate_task", commandId: "delegate-task", kind: "delegate_task" },
  ])("%j never parses to actionType delegate_task", (extra) => {
    const body = JSON.stringify({ companyId: "acme", commandId: "digest", label: "x", fields: { task: "tidy" }, ...extra })
    const { proposal } = parseActionProposal(`Ok.\n<action_proposal>${body}</action_proposal>`)
    expect(proposal?.actionType).not.toBe("delegate_task")
  })
})
