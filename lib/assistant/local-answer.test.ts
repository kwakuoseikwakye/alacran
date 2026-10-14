import { describe, expect, it } from "vitest"
import { answerLocally, type LocalAnswerDeps } from "./local-answer"

const deps = (over: Partial<LocalAnswerDeps> = {}): LocalAnswerDeps => ({
  leads: async () => [
    { name: "Harbour Lane", stage: "negotiation", value: 18000 },
    { name: "Little Loaf", stage: "lost", value: 6000 },
    { name: "Copper Kettle", stage: "qualified", value: 12500 },
  ],
  transactions: async () => [
    { type: "income", amount: 4900, status: "cleared" },
    { type: "expense", amount: 2100, status: "cleared" },
    { type: "income", amount: 4900, status: "pending" },
  ],
  pendingCount: async () => 2,
  decisionTitles: async () => ["Move clients to a monthly retainer", "Stop taking logo-only projects"],
  ...over,
})

describe("answerLocally", () => {
  it("answers the pipeline from records, with no AI", async () => {
    const answer = await answerLocally("What's my pipeline?", deps())
    expect(answer).toContain("$30,500")
    expect(answer).toContain("2 active leads")
  })

  it("answers cash from the ledger, counting only cleared money", async () => {
    expect(await answerLocally("how much cash do we have", deps())).toContain("$2,800")
  })

  it("answers what's waiting", async () => {
    expect(await answerLocally("What's waiting for me?", deps())).toMatch(/2 changes are waiting/)
  })

  it("lists recent decisions", async () => {
    expect(await answerLocally("What did we decide recently?", deps())).toContain("Move clients to a monthly retainer")
  })

  it("leaves anything that needs judgement to the AI", async () => {
    expect(await answerLocally("How should I grow my pipeline next quarter?", deps())).toBeNull()
    expect(await answerLocally("Draft an email to Harbour Lane about the deal", deps())).toBeNull()
    expect(await answerLocally("Tell me about our customers", deps())).toBeNull()
  })

  it("says plainly when there is nothing recorded", async () => {
    expect(await answerLocally("what's my pipeline", deps({ leads: async () => [] }))).toMatch(/haven't added any leads/)
  })
})
