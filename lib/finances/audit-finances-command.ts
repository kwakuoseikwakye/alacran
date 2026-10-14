import type { CompanyCommandDefinition } from "@/lib/company-commands/registry"

export const RECOMMENDATIONS_DIR = "notes/finances/recommendations"
export const AUDIT_FINANCES_COMMAND_ID = "audit-finances"

export function buildAuditFinancesPrompt(args: {
  cashBalance?: number
  monthlyBurn?: number
  prompt?: string
  statementText?: string
}): string {
  const parts: string[] = [
    `You are Alacrán's financial optimization and cash runway specialist.`,
    `Analyze the company's financial state and identify high-confidence cost-saving recommendations and cash runway metrics.`,
    ``,
  ]

  if (args.cashBalance != null) {
    parts.push(`Current cash balance on hand: $${args.cashBalance.toLocaleString()}`)
  }
  if (args.monthlyBurn != null) {
    parts.push(`Current estimated monthly burn: $${args.monthlyBurn.toLocaleString()}`)
  }
  if (args.prompt && args.prompt.trim()) {
    parts.push(`Focus area / instructions from founder: "${args.prompt.trim()}"`)
  }
  if (args.statementText && args.statementText.trim()) {
    parts.push(`\nStatement export data provided by founder:`)
    parts.push(`\`\`\`csv\n${args.statementText.trim().slice(0, 15000)}\n\`\`\``)
  }

  parts.push(
    ``,
    `Instructions:`,
    `1. Read any existing records in records/finances/transactions.yaml and categories.yaml if present.`,
    `2. Calculate the estimated cash runway in months.`,
    `3. Identify 2 to 5 concrete, actionable cost-saving recommendations (e.g. redundant SaaS, unused seats, annual vs monthly pricing, compute savings).`,
    `4. Write each recommendation as a separate markdown file strictly inside: ${RECOMMENDATIONS_DIR}/<YYYY-MM-DD>-<slug>.md`,
    `5. Format each file with YAML frontmatter:`,
    `---`,
    `id: "rec-<YYYY-MM-DD>-<slug>"`,
    `date: "<YYYY-MM-DD>"`,
    `title: "<Short clear title>"`,
    `vendor: "<Vendor or Service Name>"`,
    `category: "<e.g. Software & Subscriptions, Infrastructure, Operations>"`,
    `action_type: "cancel" | "negotiate" | "downgrade" | "optimize"`,
    `potential_savings_monthly: <number in USD>`,
    `currency: "USD"`,
    `status: "pending"`,
    `priority: "high" | "medium" | "low"`,
    `vendor_url: "<Direct link to billing or cancellation settings if known>"`,
    `---`,
    `### Audit finding & rationale`,
    `<Clear description of why this cost should be optimized>`,
    ``,
    `### Action plan`,
    `<Specific steps to take>`,
    ``,
    `### Draft vendor / support outreach`,
    `<Pre-written email or message the founder can copy and send to vendor/support>`,
    ``,
    `Gate reminder: Respect the AGENTS.md §6 Money and Publication gate. Never make financial commitments, negotiate terms, or send outreach emails directly. All recommendations and pitches must remain drafts for human review and approval.`
  )

  return parts.join("\n")
}

function parseCurrencyInput(val: unknown): number | undefined {
  if (typeof val === "number") {
    return Number.isFinite(val) ? val : undefined
  }
  if (typeof val === "string" && val.trim() !== "") {
    const cleaned = val.replace(/[^0-9.-]/g, "")
    if (cleaned !== "") {
      const parsed = Number(cleaned)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return undefined
}

export const AUDIT_FINANCES_COMMAND: CompanyCommandDefinition = {
  id: AUDIT_FINANCES_COMMAND_ID,
  commandFileName: "audit-finances.md",
  label: "Audit spend & cash runway",
  description: "Analyzes expenses, subscriptions, and cash balance to calculate runway and identify recurring savings.",
  fields: [
    { key: "cashBalance", label: "Current cash balance ($)", required: false, multiline: false },
    { key: "monthlyBurn", label: "Estimated monthly burn ($)", required: false, multiline: false },
    { key: "prompt", label: "Focus area / instructions", required: false, multiline: true },
    { key: "statementText", label: "Statement CSV text", required: false, multiline: true },
  ],
  outputKind: "new-file-in-dir",
  outputPath: RECOMMENDATIONS_DIR,
  untrustedInput: true,
  buildPrompt: (args) =>
    buildAuditFinancesPrompt({
      cashBalance: parseCurrencyInput(args?.cashBalance),
      monthlyBurn: parseCurrencyInput(args?.monthlyBurn),
      prompt: typeof args?.prompt === "string" ? args.prompt : undefined,
      statementText: typeof args?.statementText === "string" ? args.statementText : undefined,
    }),
}
