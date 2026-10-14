import { describe, it, expect } from "vitest"
import { buildFinancesViewModel } from "./finances-adapter"
import type { Transaction, FinancialCategory } from "@/lib/os/schemas/finances"
import type { DepartmentConnector } from "@/lib/os/departments/connectors"

// Pinned so "this month" is deterministic: September 2026.
const NOW = new Date("2026-09-11T12:00:00Z")

const tx = (over: Partial<Transaction> & Pick<Transaction, "id" | "amount" | "type">): Transaction => ({
  date: "2026-09-05",
  description: over.id,
  currency: "USD",
  category: "misc",
  account: "mercury",
  status: "cleared",
  ...over,
})

const categories: FinancialCategory[] = [
  { id: "sales", name: "Sales", type: "income" },
  { id: "hosting", name: "Hosting", type: "expense" },
  { id: "payroll", name: "Payroll", type: "expense" },
]

const connectors: DepartmentConnector[] = [
  { id: "stripe", label: "Stripe", status: "connected" },
  { id: "mercury", label: "Mercury", status: "not_configured" },
  { id: "quickbooks", label: "QuickBooks", status: "error" },
]

describe("buildFinancesViewModel", () => {
  it("calculates MTD income, expenses, net, and category slices", () => {
    const transactions = [
      tx({ id: "tx-1", amount: 5000, type: "income", category: "sales" }),
      tx({ id: "tx-2", amount: 1200, type: "expense", category: "hosting" }),
    ]
    const model = buildFinancesViewModel({ transactions, categories, connectors: [], now: NOW })
    expect(model.incomeMtd).toBe(5000)
    expect(model.expenses).toBe(1200)
    expect(model.netMonthly).toBe(3800)
    expect(model.byCategory).toHaveLength(1)
    expect(model.byCategory[0].category).toBe("Hosting")
    expect(model.byCategory[0].total).toBe(1200)
  })

  it("scopes MTD to the month of `now`, excluding earlier months", () => {
    const transactions = [
      tx({ id: "this", amount: 100, type: "income", date: "2026-09-01" }),
      tx({ id: "last", amount: 900, type: "income", date: "2026-08-31" }),
      tx({ id: "iso", amount: 50, type: "expense", date: "2026-09-10T08:00:00Z" }),
    ]
    const model = buildFinancesViewModel({ transactions, categories, connectors: [], now: NOW })
    expect(model.incomeMtd).toBe(100)
    expect(model.expenses).toBe(50)
    expect(model.monthLabel).toBe("Sep 2026")
  })

  it("sorts categories by descending spend and falls back to the raw id when unnamed", () => {
    const transactions = [
      tx({ id: "a", amount: 10, type: "expense", category: "hosting" }),
      tx({ id: "b", amount: 500, type: "expense", category: "payroll" }),
      tx({ id: "c", amount: 40, type: "expense", category: "unlisted-id" }),
    ]
    const model = buildFinancesViewModel({ transactions, categories, connectors: [], now: NOW })
    expect(model.byCategory.map((c) => c.category)).toEqual(["Payroll", "unlisted-id", "Hosting"])
  })

  it("maps processor accounts to honest live / configured states", () => {
    const model = buildFinancesViewModel({ transactions: [], categories, connectors, now: NOW })
    const byId = Object.fromEntries(model.accounts.map((a) => [a.id, a]))
    expect(byId.stripe).toMatchObject({ live: true, configured: true })
    expect(byId.mercury).toMatchObject({ live: false, configured: false })
    // An erroring connector has a key but no working pull — configured, not live.
    expect(byId.quickbooks).toMatchObject({ live: false, configured: true })
  })

  it("never calls a processor live on a key inherited from the machine", () => {
    const model = buildFinancesViewModel({
      transactions: [],
      categories,
      connectors: [{ id: "stripe", label: "Stripe", status: "connected", source: "machine" }],
      now: NOW,
    })
    expect(model.accounts[0]).toMatchObject({ live: false, configured: true, machineDefault: true })
    expect(model.stripeLive).toBe(false)
    expect(model.stripeMachineDefault).toBe(true)
  })

  it("attributes MTD income to the processor account it was recorded against", () => {
    const transactions = [
      tx({ id: "s1", amount: 300, type: "income", account: "stripe" }),
      tx({ id: "s2", amount: 200, type: "income", account: "stripe" }),
      tx({ id: "m1", amount: 50, type: "income", account: "mercury" }),
    ]
    const model = buildFinancesViewModel({ transactions, categories, connectors, now: NOW })
    const byId = Object.fromEntries(model.accounts.map((a) => [a.id, a]))
    expect(byId.stripe.income).toBe(500)
    expect(byId.mercury.income).toBe(50)
    expect(byId.quickbooks.income).toBeNull()
  })

  it("derives the Stripe balance from income collected, never net of bills paid on that rail", () => {
    const transactions = [
      tx({ id: "c1", amount: 1000, type: "income", account: "stripe", status: "cleared" }),
      // A bill paid via a Stripe-processed card. On the real ledger this was a
      // $420 Anthropic charge that made "available" read -$420. Must not count.
      tx({ id: "c2", amount: 100, type: "expense", account: "stripe", status: "cleared" }),
      tx({ id: "p1", amount: 250, type: "income", account: "stripe", status: "pending" }),
      tx({ id: "other", amount: 999, type: "income", account: "mercury", status: "pending" }),
    ]
    const model = buildFinancesViewModel({ transactions, categories, connectors, now: NOW })
    expect(model.stripeAvailable).toBe(1000)
    expect(model.stripePending).toBe(250)
    expect(model.stripeLive).toBe(true)
  })

  it("lists recent income newest first with unix-second timestamps", () => {
    const transactions = [
      tx({ id: "old", amount: 1, type: "income", date: "2026-09-01", description: "first" }),
      tx({ id: "new", amount: 2, type: "income", date: "2026-09-10", description: "latest" }),
      tx({ id: "exp", amount: 3, type: "expense", date: "2026-09-11" }),
    ]
    const model = buildFinancesViewModel({ transactions, categories, connectors: [], now: NOW })
    expect(model.recentCharges.map((c) => c.description)).toEqual(["latest", "first"])
    expect(model.recentCharges[0].created).toBe(Math.floor(Date.parse("2026-09-10") / 1000))
  })

  it("groups income into a per-account monthly series", () => {
    const transactions = [
      tx({ id: "a", amount: 10, type: "income", account: "vantage", date: "2026-08-03" }),
      tx({ id: "b", amount: 20, type: "income", account: "vantage", date: "2026-08-20" }),
      tx({ id: "c", amount: 5, type: "income", account: "vantage", date: "2026-09-01" }),
      tx({ id: "d", amount: 7, type: "income", account: "ops", date: "2026-09-02" }),
    ]
    const model = buildFinancesViewModel({ transactions, categories, connectors: [], now: NOW })
    const vantage = model.bankSeries.find((s) => s.business === "vantage")
    expect(vantage?.points).toEqual([
      { date: "2026-08", amount: 30 },
      { date: "2026-09", amount: 5 },
    ])
    expect(model.bankSeries.map((s) => s.business).sort()).toEqual(["ops", "vantage"])
  })

  it("renders an empty ledger honestly — zeros, no month label, nothing invented", () => {
    const model = buildFinancesViewModel({ transactions: [], categories: [], connectors: [], now: NOW })
    expect(model.incomeMtd).toBe(0)
    expect(model.expenses).toBe(0)
    expect(model.netMonthly).toBe(0)
    expect(model.isExpensesLive).toBe(false)
    expect(model.monthLabel).toBeNull()
    expect(model.byCategory).toEqual([])
    expect(model.recentCharges).toEqual([])
    expect(model.bankSeries).toEqual([])
    expect(model.accounts).toEqual([])
  })
})
