import { describe, it, expect } from "vitest"
import { FinancesCockpit } from "./finances-cockpit"
import type { FinancesViewModel } from "@/lib/os/departments/adapters/finances-adapter"

describe("FinancesCockpit", () => {
  it("renders summary tiles, processors, and category breakdowns", () => {
    const model: FinancesViewModel = {
      incomeMtd: 15000,
      expenses: 4200,
      netMonthly: 10800,
      isExpensesLive: true,
      monthLabel: "Sep 2026",
      stripeAvailable: 8000,
      stripePending: 1200,
      stripeLive: true,
      stripeMachineDefault: false,
      accounts: [
        { id: "stripe", label: "Stripe", processor: "stripe", income: 10000, live: true, machineDefault: false, configured: true },
        { id: "mercury", label: "Mercury", processor: "mercury", income: 5000, live: false, machineDefault: false, configured: true },
      ],
      byCategory: [
        { category: "Hosting", total: 1200 },
        { category: "Payroll", total: 3000 },
      ],
      recentCharges: [
        { amount: 5000, currency: "USD", description: "Acme Corp retainer", created: 1726000000 },
      ],
      bankSeries: [
        {
          business: "Alacrán Ops",
          points: [{ date: "2026-09", amount: 15000 }],
        },
      ],
    }

    const element = FinancesCockpit({ model, companyId: "alacran-app" })
    expect(element).toBeDefined()
    expect(element.props.className).toContain("space-y-6")
  })
})
