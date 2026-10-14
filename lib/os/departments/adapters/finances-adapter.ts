import type { Transaction, FinancialCategory } from "@/lib/os/schemas/finances"
import type { DepartmentConnector } from "@/lib/os/departments/connectors"

export type ProcessorAccount = {
  id: string
  label: string
  processor: string
  /** MTD income recorded against this account, or null when nothing was. */
  income: number | null
  /** The connector reports connected with this company's own key. Nothing
   *  more — no API was called. */
  live: boolean
  /** Connected only through a machine-wide key, which may be another
   *  company's account. Shown as such, never as live. */
  machineDefault: boolean
  /** A key exists, whether or not it works. `error` counts: key set, pull broken. */
  configured: boolean
}

export type CategoryExpense = { category: string; total: number }

export type RecentCharge = {
  amount: number
  currency: string
  description: string
  /** unix seconds, to match what the FounderOS `ago()` helper expects */
  created: number
}

export type BusinessIncomeSeries = {
  business: string
  points: { date: string; amount: number }[]
}

export type FinancesViewModel = {
  incomeMtd: number
  expenses: number
  netMonthly: number
  /** True when the ledger has any records. There is no sample fallback: an
   *  empty ledger renders empty, per AGENTS.md §5 — never invent a fact. */
  isExpensesLive: boolean
  monthLabel: string | null
  stripeAvailable: number
  stripePending: number
  stripeLive: boolean
  stripeMachineDefault: boolean
  accounts: ProcessorAccount[]
  byCategory: CategoryExpense[]
  recentCharges: RecentCharge[]
  bankSeries: BusinessIncomeSeries[]
}

const STRIPE = "stripe"
const RECENT_LIMIT = 8

/** "2026-09-05" and "2026-09-10T08:00:00Z" both yield "2026-09". */
const monthOf = (date: string) => date.slice(0, 7)

/**
 * Translates the plain-file ledger into the shape the FounderOS finances
 * cockpit renders. FounderOS reads live Stripe/FanBasis/Wise APIs and a SQLite
 * statement ledger; Alacrán has one YAML ledger and connector *status*. So:
 *
 * - "live" on a processor means its connector says connected — never that a
 *   balance was fetched, because none is.
 * - The Stripe balance is derived from stripe-account transactions: cleared
 *   net is "available", pending net is "pending". Honest, and labelled as
 *   derived by the cockpit.
 * - No SAMPLE_EXPENSES fallback. Empty is empty.
 */
export function buildFinancesViewModel(input: {
  transactions: Transaction[]
  categories: FinancialCategory[]
  connectors: DepartmentConnector[]
  now?: Date
}): FinancesViewModel {
  const now = input.now ?? new Date()
  const month = now.toISOString().slice(0, 7)
  const mtd = input.transactions.filter((t) => monthOf(t.date) === month)

  const sum = (list: Transaction[]) => list.reduce((s, t) => s + t.amount, 0)
  const incomeMtd = sum(mtd.filter((t) => t.type === "income"))
  const expenses = sum(mtd.filter((t) => t.type === "expense"))

  const nameOf = new Map(input.categories.map((c) => [c.id, c.name]))
  const byCategoryMap = new Map<string, number>()
  for (const t of mtd) {
    if (t.type !== "expense") continue
    const label = nameOf.get(t.category) ?? t.category
    byCategoryMap.set(label, (byCategoryMap.get(label) ?? 0) + t.amount)
  }
  const byCategory = [...byCategoryMap]
    .map(([category, total]) => ({ category, total }))
    .sort((a, b) => b.total - a.total)

  const incomeByAccount = new Map<string, number>()
  for (const t of mtd) {
    if (t.type !== "income") continue
    incomeByAccount.set(t.account, (incomeByAccount.get(t.account) ?? 0) + t.amount)
  }
  const accounts: ProcessorAccount[] = input.connectors.map((c) => ({
    id: c.id,
    label: c.label,
    processor: c.id,
    income: incomeByAccount.get(c.id) ?? null,
    live: c.status === "connected" && c.source !== "machine",
    machineDefault: c.status === "connected" && c.source === "machine",
    configured: c.status !== "not_configured",
  }))

  // Income only — never net of expenses. In this ledger `account` is the rail
  // the money moved on, so an expense with account "stripe" is a bill paid via
  // a Stripe-processed card, not money Stripe holds. Netting it in produced a
  // "-$420 available" on the real records: an Anthropic API charge. A processor
  // balance is what it collected, which is also what FounderOS's live figure is.
  const stripeIn = input.transactions.filter((t) => t.account === STRIPE && t.type === "income")
  const stripeAvailable = sum(stripeIn.filter((t) => t.status === "cleared"))
  const stripePending = sum(stripeIn.filter((t) => t.status === "pending"))
  const stripeConnector = input.connectors.find((c) => c.id === STRIPE && c.status === "connected")
  const stripeLive = !!stripeConnector && stripeConnector.source !== "machine"
  const stripeMachineDefault = stripeConnector?.source === "machine"

  const recentCharges: RecentCharge[] = input.transactions
    .filter((t) => t.type === "income")
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .slice(0, RECENT_LIMIT)
    .map((t) => ({
      amount: t.amount,
      currency: t.currency,
      description: t.description,
      created: Math.floor(Date.parse(t.date) / 1000),
    }))

  const seriesMap = new Map<string, Map<string, number>>()
  for (const t of input.transactions) {
    if (t.type !== "income") continue
    const months = seriesMap.get(t.account) ?? new Map<string, number>()
    const m = monthOf(t.date)
    months.set(m, (months.get(m) ?? 0) + t.amount)
    seriesMap.set(t.account, months)
  }
  const bankSeries: BusinessIncomeSeries[] = [...seriesMap].map(([business, months]) => ({
    business,
    points: [...months]
      .map(([date, amount]) => ({ date, amount }))
      .sort((a, b) => a.date.localeCompare(b.date)),
  }))

  const isExpensesLive = input.transactions.length > 0
  const monthLabel = isExpensesLive
    ? new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" })
    : null

  return {
    incomeMtd,
    expenses,
    netMonthly: incomeMtd - expenses,
    isExpensesLive,
    monthLabel,
    stripeAvailable,
    stripePending,
    stripeLive,
    stripeMachineDefault,
    accounts,
    byCategory,
    recentCharges,
    bankSeries,
  }
}
