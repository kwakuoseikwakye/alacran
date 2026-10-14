import type { Lead, FunnelStage } from "../schemas/funnel"
import type { Transaction } from "../schemas/finances"
import type { SocialAccount, SocialSnapshot } from "../schemas/social"
import type { ContentItem } from "../schemas/content"

export type FunnelMetrics = {
  totalValue: number
  activeLeadsCount: number
  wonLeadsCount: number
  lostLeadsCount: number
  winRate: number
  avgDealSize: number
  stageBreakdown: Record<string, { count: number; value: number }>
}

export function calculateFunnelMetrics(leads: Lead[], stages?: FunnelStage[]): FunnelMetrics {
  let totalValue = 0
  let activeLeadsCount = 0
  let wonLeadsCount = 0
  let lostLeadsCount = 0
  const stageBreakdown: Record<string, { count: number; value: number }> = {}

  if (stages) {
    for (const stage of stages) {
      stageBreakdown[stage.id] = { count: 0, value: 0 }
    }
  }

  for (const lead of leads) {
    totalValue += lead.value

    if (lead.stage === "won") {
      wonLeadsCount++
    } else if (lead.stage === "lost") {
      lostLeadsCount++
    } else {
      activeLeadsCount++
    }

    if (!stageBreakdown[lead.stage]) {
      stageBreakdown[lead.stage] = { count: 0, value: 0 }
    }
    stageBreakdown[lead.stage].count++
    stageBreakdown[lead.stage].value += lead.value
  }

  const finishedCount = wonLeadsCount + lostLeadsCount
  const winRate = finishedCount > 0 ? wonLeadsCount / finishedCount : 0
  const avgDealSize = leads.length > 0 ? totalValue / leads.length : 0

  return {
    totalValue,
    activeLeadsCount,
    wonLeadsCount,
    lostLeadsCount,
    winRate,
    avgDealSize,
    stageBreakdown,
  }
}

export type FinancialMetrics = {
  totalIncome: number
  totalExpense: number
  netBalance: number
  pendingCount: number
  categoryBreakdown: Record<string, { income: number; expense: number }>
}

export function calculateFinancialMetrics(transactions: Transaction[]): FinancialMetrics {
  let totalIncome = 0
  let totalExpense = 0
  let pendingCount = 0
  const categoryBreakdown: Record<string, { income: number; expense: number }> = {}

  for (const tx of transactions) {
    if (tx.status === "pending") {
      pendingCount++
    }

    if (tx.type === "income") {
      totalIncome += tx.amount
    } else {
      totalExpense += tx.amount
    }

    if (!categoryBreakdown[tx.category]) {
      categoryBreakdown[tx.category] = { income: 0, expense: 0 }
    }

    if (tx.type === "income") {
      categoryBreakdown[tx.category].income += tx.amount
    } else {
      categoryBreakdown[tx.category].expense += tx.amount
    }
  }

  return {
    totalIncome,
    totalExpense,
    netBalance: totalIncome - totalExpense,
    pendingCount,
    categoryBreakdown,
  }
}

export type SocialMetrics = {
  totalFollowers: number
  totalAccounts: number
  platformBreakdown: Record<string, { followers: number; handle: string; url: string }>
}

export function calculateSocialMetrics(
  accounts: SocialAccount[],
  _snapshots?: SocialSnapshot[]
): SocialMetrics {
  let totalFollowers = 0
  const platformBreakdown: Record<string, { followers: number; handle: string; url: string }> = {}

  for (const acc of accounts) {
    totalFollowers += acc.followers
    platformBreakdown[acc.platform] = {
      followers: acc.followers,
      handle: acc.handle,
      url: acc.url,
    }
  }

  return {
    totalFollowers,
    totalAccounts: accounts.length,
    platformBreakdown,
  }
}

export type ContentMetrics = {
  totalItems: number
  publishedCount: number
  scheduledCount: number
  inProgressCount: number
  channelBreakdown: Record<string, number>
  statusBreakdown: Record<string, number>
}

export function calculateContentMetrics(items: ContentItem[]): ContentMetrics {
  let publishedCount = 0
  let scheduledCount = 0
  let inProgressCount = 0
  const channelBreakdown: Record<string, number> = {}
  const statusBreakdown: Record<string, number> = {}

  for (const item of items) {
    if (item.status === "published") {
      publishedCount++
    } else if (item.status === "scheduled") {
      scheduledCount++
    } else if (item.status === "idea" || item.status === "draft" || item.status === "review") {
      inProgressCount++
    }

    channelBreakdown[item.channel] = (channelBreakdown[item.channel] ?? 0) + 1
    statusBreakdown[item.status] = (statusBreakdown[item.status] ?? 0) + 1
  }

  return {
    totalItems: items.length,
    publishedCount,
    scheduledCount,
    inProgressCount,
    channelBreakdown,
    statusBreakdown,
  }
}

