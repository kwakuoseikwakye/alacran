import { describe, it, expect } from "vitest"
import {
  computeConnectorBarColors,
  computePipelineTotal,
  computeCashBalance,
  computeAudienceTotal,
  formatCurrency,
} from "./stat-tiles"

describe("stat-tiles helpers", () => {
  describe("computeConnectorBarColors", () => {
    it("maps connected, not_configured, and error statuses to FounderOS color vars and opacity", () => {
      const items = computeConnectorBarColors([
        { id: "stripe", status: "connected" },
        { id: "attio", status: "not_configured" },
        { id: "ghost", status: "error" },
      ])

      expect(items).toEqual([
        { id: "stripe", colorVar: "var(--ok)", opacity: 1 },
        { id: "attio", colorVar: "var(--dim)", opacity: 0.6 },
        { id: "ghost", colorVar: "var(--err)", opacity: 0.75 },
      ])
    })
  })

  describe("computePipelineTotal", () => {
    it("sums active deals while excluding lost deals", () => {
      const leads = [
        { stage: "new", value: 12000 },
        { stage: "negotiation", value: 35000 },
        { stage: "won", value: 50000 },
        { stage: "lost", value: 18000 },
      ]

      const result = computePipelineTotal(leads)
      expect(result.total).toBe(97000)
      expect(result.count).toBe(4)
      expect(result.activeCount).toBe(3)
    })

    it("handles empty leads array", () => {
      const result = computePipelineTotal([])
      expect(result.total).toBe(0)
      expect(result.count).toBe(0)
      expect(result.activeCount).toBe(0)
    })
  })

  describe("computeCashBalance", () => {
    it("computes net balance as income minus expense", () => {
      const transactions: Array<{ type: "income" | "expense"; amount: number }> = [
        { type: "income", amount: 15000 },
        { type: "expense", amount: 4200 },
        { type: "income", amount: 8500 },
        { type: "expense", amount: 1300 },
      ]

      const result = computeCashBalance(transactions)
      expect(result.incomeTotal).toBe(23500)
      expect(result.expenseTotal).toBe(5500)
      expect(result.balance).toBe(18000)
    })

    it("handles negative net balance when expenses exceed income", () => {
      const transactions: Array<{ type: "income" | "expense"; amount: number }> = [
        { type: "income", amount: 2000 },
        { type: "expense", amount: 5000 },
      ]

      const result = computeCashBalance(transactions)
      expect(result.balance).toBe(-3000)
    })
  })

  describe("computeAudienceTotal", () => {
    it("sums followers across accounts and returns account count", () => {
      const accounts = [
        { followers: 1250 },
        { followers: 3400 },
        { followers: 820 },
      ]

      const result = computeAudienceTotal(accounts)
      expect(result.totalFollowers).toBe(5470)
      expect(result.accountCount).toBe(3)
    })

    it("handles accounts with zero followers", () => {
      const accounts = [{ followers: 0 }]
      const result = computeAudienceTotal(accounts)
      expect(result.totalFollowers).toBe(0)
      expect(result.accountCount).toBe(1)
    })
  })

  describe("formatCurrency", () => {
    it("formats standard USD currency amounts with thousands separators", () => {
      expect(formatCurrency(125000)).toBe("$125,000")
      expect(formatCurrency(0)).toBe("$0")
      expect(formatCurrency(5400)).toBe("$5,400")
    })

    it("formats non-USD currency if specified", () => {
      expect(formatCurrency(1000, "EUR")).toBe("€1,000")
    })
  })
})
