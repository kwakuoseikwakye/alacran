import { promises as fs } from "node:fs"
import path from "node:path"
import yaml from "yaml"
import type { FinancesRecommendation } from "./recommendations"
import { RUNWAY_FILE } from "./mark-savings-realized-impl"

export interface RunwayMetrics {
  cashBalance: number
  monthlyBurn: number
  runwayMonths: number
  currency: string
  realizedSavingsMonthly: number
  realizedSavingsAnnual: number
  healthColor: "emerald" | "amber" | "coral"
  healthLabel: string
}

export function calculateRunway(
  cashBalance: number,
  monthlyBurn: number
): { runwayMonths: number; healthColor: "emerald" | "amber" | "coral"; healthLabel: string } {
  const safeCash = Number.isFinite(cashBalance) ? cashBalance : 0
  const safeBurn = Number.isFinite(monthlyBurn) ? monthlyBurn : 0
  if (safeBurn <= 0) {
    return { runwayMonths: 999, healthColor: "emerald", healthLabel: "Infinite (Profitable or 0 burn)" }
  }
  const months = Math.round((safeCash / safeBurn) * 10) / 10
  if (months >= 12) {
    return { runwayMonths: months, healthColor: "emerald", healthLabel: `${months} months (Strong)` }
  }
  if (months >= 6) {
    return { runwayMonths: months, healthColor: "amber", healthLabel: `${months} months (Caution)` }
  }
  return { runwayMonths: months, healthColor: "coral", healthLabel: `${months} months (Critical)` }
}

export async function readRunwayRecord(companyRoot: string): Promise<RunwayMetrics> {
  const filePath = path.join(companyRoot, RUNWAY_FILE)
  let raw: string
  try {
    raw = await fs.readFile(filePath, "utf-8")
  } catch {
    return {
      cashBalance: 0,
      monthlyBurn: 0,
      runwayMonths: 0,
      currency: "USD",
      realizedSavingsMonthly: 0,
      realizedSavingsAnnual: 0,
      healthColor: "amber",
      healthLabel: "No runway data logged yet",
    }
  }

  try {
    const data = yaml.parse(raw)
    const rawCash =
      typeof data?.cash_balance === "number"
        ? data.cash_balance
        : typeof data?.cashBalance === "number"
          ? data.cashBalance
          : Number(String(data?.cash_balance ?? data?.cashBalance ?? 0).replace(/[^0-9.-]/g, ""))
    const cash = Number.isFinite(rawCash) ? rawCash : 0

    const rawBurn =
      typeof data?.monthly_burn === "number"
        ? data.monthly_burn
        : typeof data?.monthlyBurn === "number"
          ? data.monthlyBurn
          : Number(String(data?.monthly_burn ?? data?.monthlyBurn ?? 0).replace(/[^0-9.-]/g, ""))
    const burn = Number.isFinite(rawBurn) ? rawBurn : 0

    const { runwayMonths, healthColor, healthLabel } = calculateRunway(cash, burn)

    const rawRealizedMonthly =
      typeof data?.realized_savings_monthly === "number"
        ? data.realized_savings_monthly
        : typeof data?.realizedSavingsMonthly === "number"
          ? data.realizedSavingsMonthly
          : Number(String(data?.realized_savings_monthly ?? data?.realizedSavingsMonthly ?? 0).replace(/[^0-9.-]/g, ""))
    const realizedMonthly = Number.isFinite(rawRealizedMonthly) ? rawRealizedMonthly : 0

    const rawRealizedAnnual =
      typeof data?.realized_savings_annual === "number"
        ? data.realized_savings_annual
        : typeof data?.realizedSavingsAnnual === "number"
          ? data.realizedSavingsAnnual
          : Number(String(data?.realized_savings_annual ?? data?.realizedSavingsAnnual ?? realizedMonthly * 12).replace(/[^0-9.-]/g, ""))
    const realizedAnnual = Number.isFinite(rawRealizedAnnual) ? rawRealizedAnnual : realizedMonthly * 12

    return {
      cashBalance: cash,
      monthlyBurn: burn,
      runwayMonths,
      currency: String(data?.currency || "USD"),
      realizedSavingsMonthly: realizedMonthly,
      realizedSavingsAnnual: realizedAnnual,
      healthColor,
      healthLabel,
    }
  } catch {
    return {
      cashBalance: 0,
      monthlyBurn: 0,
      runwayMonths: 0,
      currency: "USD",
      realizedSavingsMonthly: 0,
      realizedSavingsAnnual: 0,
      healthColor: "amber",
      healthLabel: "Invalid runway record",
    }
  }
}

function escapeCsvCell(val: unknown): string {
  if (val == null) return '""'
  let s = String(val)
  if (/^[=+\-@\t]/.test(s)) {
    s = "'" + s
  }
  return `"${s.replace(/"/g, '""')}"`
}

function escapeTsvCell(val: unknown): string {
  if (val == null) return ""
  let s = String(val)
  if (/^[=+\-@\t]/.test(s)) {
    s = "'" + s
  }
  return s.replace(/[\r\n\t]+/g, " ")
}

export function exportRecommendationsToCsv(recommendations: FinancesRecommendation[]): string {
  const headers = ["Vendor", "Title", "Action", "Monthly Savings", "Status", "Priority", "URL"]
  const rows = recommendations.map((r) => [
    escapeCsvCell(r.vendor),
    escapeCsvCell(r.title),
    escapeCsvCell(r.actionType),
    escapeCsvCell(r.potentialSavingsMonthly),
    escapeCsvCell(r.status),
    escapeCsvCell(r.priority),
    escapeCsvCell(r.vendorUrl || ""),
  ])
  return [headers.join(","), ...rows.map((row) => row.join(","))].join("\n")
}

export function exportRecommendationsToTsv(recommendations: FinancesRecommendation[]): string {
  const headers = ["Vendor", "Title", "Action", "Monthly Savings", "Status", "Priority", "URL"]
  const rows = recommendations.map((r) => [
    escapeTsvCell(r.vendor),
    escapeTsvCell(r.title),
    escapeTsvCell(r.actionType),
    escapeTsvCell(r.potentialSavingsMonthly),
    escapeTsvCell(r.status),
    escapeTsvCell(r.priority),
    escapeTsvCell(r.vendorUrl || ""),
  ])
  return [headers.join("\t"), ...rows.map((row) => row.join("\t"))].join("\n")
}
