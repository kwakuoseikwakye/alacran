import { describe, it, expect } from "vitest"
import {
  TransactionSchema,
  TransactionsFileSchema,
  FinancialCategorySchema,
  FinancialCategoriesFileSchema,
} from "./finances"

describe("TransactionSchema", () => {
  it("validates a transaction record", () => {
    const fixture = {
      id: "tx-101",
      date: "2026-09-01",
      description: "AWS Cloud Infrastructure",
      amount: 450.25,
      currency: "USD",
      type: "expense",
      category: "hosting",
      account: "mercury",
      status: "cleared",
      provenance: [
        { claim: "monthly server cost", said_by: "agent", said_on: "2026-09-01", source: "stripe" },
      ],
    }
    const parsed = TransactionSchema.parse(fixture)
    expect(parsed.id).toBe("tx-101")
    expect(parsed.type).toBe("expense")
    expect(parsed.amount).toBe(450.25)
  })

  it("fails on invalid transaction type", () => {
    const fixture = {
      id: "tx-bad",
      date: "2026-09-01",
      description: "Bad Tx",
      amount: 100,
      currency: "USD",
      type: "transfer", // invalid
      category: "other",
      account: "mercury",
      status: "cleared",
    }
    expect(() => TransactionSchema.parse(fixture)).toThrow()
  })

  it("validates transactions file schema", () => {
    const file = {
      schema_version: 1,
      records: [
        {
          id: "tx-1",
          date: "2026-09-02",
          description: "Customer Subscription",
          amount: 1200,
          currency: "USD",
          type: "income",
          category: "revenue",
          account: "stripe",
          status: "cleared",
        },
      ],
    }
    const parsed = TransactionsFileSchema.parse(file)
    expect(parsed.records).toHaveLength(1)
  })
})

describe("FinancialCategorySchema", () => {
  it("validates a category record", () => {
    const cat = {
      id: "hosting",
      name: "Cloud & Hosting",
      type: "expense",
      budget: 1000,
    }
    const parsed = FinancialCategorySchema.parse(cat)
    expect(parsed.name).toBe("Cloud & Hosting")
  })

  it("validates categories file schema", () => {
    const file = {
      schema_version: 1,
      records: [
        { id: "revenue", name: "Client Revenue", type: "income" },
        { id: "hosting", name: "Hosting", type: "expense", budget: 1000 },
      ],
    }
    const parsed = FinancialCategoriesFileSchema.parse(file)
    expect(parsed.records).toHaveLength(2)
  })
})
