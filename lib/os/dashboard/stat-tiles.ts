export type ConnectorBarItem = {
  id: string
  colorVar: string
  opacity: number
}

export function computeConnectorBarColors(
  connectors: Array<{ id: string; status: "connected" | "not_configured" | "error" }>
): ConnectorBarItem[] {
  return connectors.map((c) => {
    if (c.status === "connected") {
      return { id: c.id, colorVar: "var(--ok)", opacity: 1 }
    }
    if (c.status === "error") {
      return { id: c.id, colorVar: "var(--err)", opacity: 0.75 }
    }
    return { id: c.id, colorVar: "var(--dim)", opacity: 0.6 }
  })
}

export function formatCurrency(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
  }).format(amount)
}

export function computePipelineTotal(leads: Array<{ stage: string; value: number }>): {
  total: number
  count: number
  activeCount: number
} {
  const activeLeads = leads.filter((l) => l.stage !== "lost")
  const total = activeLeads.reduce((sum, l) => sum + (l.value || 0), 0)
  return {
    total,
    count: leads.length,
    activeCount: activeLeads.length,
  }
}

export function computeCashBalance(transactions: Array<{ type: "income" | "expense"; amount: number }>): {
  balance: number
  incomeTotal: number
  expenseTotal: number
} {
  let incomeTotal = 0
  let expenseTotal = 0
  for (const tx of transactions) {
    if (tx.type === "income") {
      incomeTotal += tx.amount || 0
    } else if (tx.type === "expense") {
      expenseTotal += tx.amount || 0
    }
  }
  return {
    balance: incomeTotal - expenseTotal,
    incomeTotal,
    expenseTotal,
  }
}

export function computeAudienceTotal(accounts: Array<{ followers: number }>): {
  totalFollowers: number
  accountCount: number
} {
  const totalFollowers = accounts.reduce((sum, acc) => sum + (acc.followers || 0), 0)
  return {
    totalFollowers,
    accountCount: accounts.length,
  }
}
