import type { Lead } from "@/lib/os/schemas/funnel"
import type { Transaction } from "@/lib/os/schemas/finances"
import { describe, it, expect } from "vitest"
import {
  calculateFunnelMetrics,
  calculateFinancialMetrics,
  calculateSocialMetrics,
  calculateContentMetrics,
} from "./metrics"

describe("calculateFunnelMetrics", () => {
  it("computes funnel metrics on leads", () => {
    const leads: Lead[] = [
      {
        id: "l1",
        name: "Lead 1",
        stage: "new",
        source: "website",
        owner: "agent",
        value: 10000,
        currency: "USD",
        first_seen: "2026-09-01",
        last_touch: "2026-09-01",
      },
      {
        id: "l2",
        name: "Lead 2",
        stage: "won",
        source: "referral",
        owner: "human",
        value: 20000,
        currency: "USD",
        first_seen: "2026-09-01",
        last_touch: "2026-09-05",
      },
      {
        id: "l3",
        name: "Lead 3",
        stage: "lost",
        source: "outreach",
        owner: "human",
        value: 5000,
        currency: "USD",
        first_seen: "2026-09-01",
        last_touch: "2026-09-04",
      },
    ]

    const metrics = calculateFunnelMetrics(leads)
    expect(metrics.totalValue).toBe(35000)
    expect(metrics.activeLeadsCount).toBe(1)
    expect(metrics.wonLeadsCount).toBe(1)
    expect(metrics.lostLeadsCount).toBe(1)
    expect(metrics.winRate).toBe(0.5)
    expect(metrics.avgDealSize).toBeCloseTo(11666.67, 1)
  })

  it("handles empty leads gracefully", () => {
    const metrics = calculateFunnelMetrics([])
    expect(metrics.totalValue).toBe(0)
    expect(metrics.activeLeadsCount).toBe(0)
    expect(metrics.winRate).toBe(0)
    expect(metrics.avgDealSize).toBe(0)
  })
})

describe("calculateFinancialMetrics", () => {
  it("computes financial metrics on transactions", () => {
    const transactions: Transaction[] = [
      {
        id: "t1",
        date: "2026-09-01",
        description: "Invoice #1",
        amount: 5000,
        currency: "USD",
        type: "income",
        category: "revenue",
        account: "stripe",
        status: "cleared",
      },
      {
        id: "t2",
        date: "2026-09-02",
        description: "AWS Servers",
        amount: 800,
        currency: "USD",
        type: "expense",
        category: "hosting",
        account: "mercury",
        status: "cleared",
      },
      {
        id: "t3",
        date: "2026-09-03",
        description: "Contractor payment",
        amount: 2000,
        currency: "USD",
        type: "expense",
        category: "payroll",
        account: "mercury",
        status: "pending",
      },
    ]

    const metrics = calculateFinancialMetrics(transactions)
    expect(metrics.totalIncome).toBe(5000)
    expect(metrics.totalExpense).toBe(2800)
    expect(metrics.netBalance).toBe(2200)
    expect(metrics.pendingCount).toBe(1)
  })

  it("handles empty transactions gracefully", () => {
    const metrics = calculateFinancialMetrics([])
    expect(metrics.totalIncome).toBe(0)
    expect(metrics.totalExpense).toBe(0)
    expect(metrics.netBalance).toBe(0)
    expect(metrics.pendingCount).toBe(0)
  })
})

describe("calculateSocialMetrics", () => {
  it("computes social metrics across accounts", () => {
    const accounts = [
      {
        id: "x-1",
        platform: "x" as const,
        handle: "@alacran",
        url: "https://x.com/alacran",
        followers: 12000,
        last_sync: "2026-09-10",
      },
      {
        id: "li-1",
        platform: "linkedin" as const,
        handle: "alacran",
        url: "https://linkedin.com/company/alacran",
        followers: 4000,
        last_sync: "2026-09-10",
      },
    ]

    const metrics = calculateSocialMetrics(accounts)
    expect(metrics.totalFollowers).toBe(16000)
    expect(metrics.totalAccounts).toBe(2)
    expect(metrics.platformBreakdown.x.followers).toBe(12000)
  })

  it("handles empty accounts gracefully", () => {
    const metrics = calculateSocialMetrics([])
    expect(metrics.totalFollowers).toBe(0)
    expect(metrics.totalAccounts).toBe(0)
  })
})

describe("calculateContentMetrics", () => {
  it("computes content status and channel breakdown", () => {
    const items = [
      {
        id: "c1",
        title: "Launch Tweet",
        status: "published" as const,
        type: "post" as const,
        channel: "x",
        author: "human" as const,
      },
      {
        id: "c2",
        title: "Product Overview",
        status: "draft" as const,
        type: "article" as const,
        channel: "blog",
        author: "agent" as const,
      },
      {
        id: "c3",
        title: "Weekly Newsletter",
        status: "scheduled" as const,
        type: "newsletter" as const,
        channel: "email",
        author: "agent" as const,
      },
    ]

    const metrics = calculateContentMetrics(items)
    expect(metrics.totalItems).toBe(3)
    expect(metrics.publishedCount).toBe(1)
    expect(metrics.scheduledCount).toBe(1)
    expect(metrics.inProgressCount).toBe(1)
    expect(metrics.channelBreakdown.x).toBe(1)
    expect(metrics.channelBreakdown.blog).toBe(1)
  })

  it("handles empty content items gracefully", () => {
    const metrics = calculateContentMetrics([])
    expect(metrics.totalItems).toBe(0)
    expect(metrics.publishedCount).toBe(0)
  })
})

