import type { WorkflowStep } from "../schemas/workflows"

export type WorkflowStats = {
  manualHours: number
  totalLeak: number
  totalRecovered: number
  gateCount: number
}

export function computeWorkflowStats(steps: WorkflowStep[]): WorkflowStats {
  let manualHours = 0
  let totalLeak = 0
  let totalRecovered = 0
  let gateCount = 0

  for (const step of steps) {
    if (step.owner_kind === "human") {
      manualHours += step.hours_per_week || 0
    }
    if (step.leak_usd) {
      totalLeak += step.leak_usd
    }
    if (step.automation && step.automation.state === "live") {
      totalRecovered += step.automation.recovered_usd || 0
    }
    if (step.gate_checkpoint) {
      gateCount += 1
    }
  }

  return { manualHours, totalLeak, totalRecovered, gateCount }
}

export function formatUsdCompact(amount: number): string {
  if (amount >= 1000) {
    const k = amount / 1000
    return `$${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1)}k`
  }
  return `$${Math.round(amount)}`
}
