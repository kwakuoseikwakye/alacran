import type { SocialAccount, SocialSnapshot } from "@/lib/os/schemas/social"
import type { DepartmentConnector } from "@/lib/os/departments/connectors"

export const PLATFORM_LABELS: Record<string, string> = {
  x: "X",
  linkedin: "LinkedIn",
  youtube: "YouTube",
  instagram: "Instagram",
  github: "GitHub",
  bluesky: "Bluesky",
  threads: "Threads",
  other: "Other",
}

export function formatFollowers(n: number | null | undefined): string {
  if (n == null) return "—"
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`
  return String(n)
}

export function formatPct(pct: number | null | undefined): string {
  if (pct == null) return "—"
  const sign = pct >= 0 ? "+" : "−"
  return `${sign}${Math.abs(pct).toFixed(1)}%`
}

export type SocialPlatformModel = {
  platform: string
  label: string
  handle: string
  url: string
  followers: number
  growth: {
    d7: number | null
    d30: number | null
  }
}

export type SocialRecentPost = {
  id: string
  tag: string
  ago: string
  caption: string
  views: number
  likes: number
  ratio: number
  rank: number
  total: number
}

export type AudiencePoint = {
  date: string
  total: number
}

export type SocialViewModel = {
  totalReach: number
  platforms: SocialPlatformModel[]
  pieItems: { key: string; label: string; value: number }[]
  statStrip: {
    audienceTotal: number
    growth7d: number | null
    growth30d: number | null
    totalImpressions: number
    totalEngagements: number
  }
  audiencePoints: AudiencePoint[]
  recentPosts: SocialRecentPost[]
  connectors: DepartmentConnector[]
  isLive: boolean
}

export function buildSocialViewModel(input: {
  accounts: SocialAccount[]
  snapshots: SocialSnapshot[]
  connectors: DepartmentConnector[]
  contentItems?: Array<{ id: string; title: string; channel?: string; publish_date?: string; status?: string }>
  now?: Date
}): SocialViewModel {
  const totalReach = input.accounts.reduce((sum, a) => sum + (a.followers || 0), 0)

  // Map snapshots by account
  const snapshotsByAccount = new Map<string, SocialSnapshot[]>()
  for (const s of input.snapshots) {
    const list = snapshotsByAccount.get(s.account_id) ?? []
    list.push(s)
    snapshotsByAccount.set(s.account_id, list)
  }

  const platforms: SocialPlatformModel[] = input.accounts.map((acc) => {
    const snaps = snapshotsByAccount.get(acc.id) ?? []
    snaps.sort((a, b) => a.date.localeCompare(b.date))

    let d7: number | null = null
    if (snaps.length >= 2) {
      const prev = snaps[0].followers
      const curr = snaps[snaps.length - 1].followers
      if (prev > 0) {
        d7 = ((curr - prev) / prev) * 100
      }
    }

    return {
      platform: acc.platform,
      label: PLATFORM_LABELS[acc.platform] ?? acc.platform,
      handle: acc.handle,
      url: acc.url,
      followers: acc.followers,
      growth: {
        d7,
        d30: d7, // Fallback if fewer snapshots
      },
    }
  })

  // Pie chart items for SharePie
  const pieItems = platforms.map((p) => ({
    key: p.platform,
    label: p.label,
    value: p.followers,
  }))

  const totalImpressions = input.snapshots.reduce((sum, s) => sum + (s.impressions ?? 0), 0)
  const totalEngagements = input.snapshots.reduce((sum, s) => sum + (s.engagements ?? 0), 0)

  // Historical audience points
  const pointsMap = new Map<string, number>()
  for (const s of input.snapshots) {
    pointsMap.set(s.date, (pointsMap.get(s.date) ?? 0) + s.followers)
  }
  const audiencePoints = [...pointsMap.entries()]
    .map(([date, total]) => ({ date, total }))
    .sort((a, b) => a.date.localeCompare(b.date))

  // Derive recent posts from authentic published content items or empty
  const publishedItems = (input.contentItems ?? []).filter((item) => item.status === "published")
  const recentPosts: SocialRecentPost[] = publishedItems.map((p, i) => ({
    id: p.id,
    tag: `${PLATFORM_LABELS[p.channel ?? "other"] ?? p.channel ?? "Post"} · Update`,
    ago: p.publish_date ?? "recent",
    caption: p.title,
    views: 0,
    likes: 0,
    ratio: 0,
    rank: i,
    total: publishedItems.length,
  }))

  const connectedCount = input.connectors.filter((c) => c.status === "connected").length

  return {
    totalReach,
    platforms,
    pieItems,
    statStrip: {
      audienceTotal: totalReach,
      growth7d: platforms.length > 0 && platforms[0].growth.d7 != null ? platforms[0].growth.d7 : null,
      growth30d: null,
      totalImpressions,
      totalEngagements,
    },
    audiencePoints,
    recentPosts,
    connectors: input.connectors,
    isLive: connectedCount > 0,
  }
}

export type SocialPlatformDetail = {
  account: SocialAccount
  followers: number
  growth: {
    d7: number | null
    d30: number | null
    d60: number | null
    allTime: number | null
  }
  snapshots: SocialSnapshot[]
}

export function computePlatformGrowth(
  snapshots: SocialSnapshot[],
  nowStr?: string
): {
  d7: number | null
  d30: number | null
  d60: number | null
  allTime: number | null
} {
  if (snapshots.length === 0) {
    return { d7: null, d30: null, d60: null, allTime: null }
  }

  const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date))
  const latest = sorted[sorted.length - 1]
  const latestDate = nowStr ? new Date(nowStr) : new Date(latest.date)

  function growthForDays(days: number): number | null {
    const targetTime = latestDate.getTime() - days * 24 * 60 * 60 * 1000
    let baseline: SocialSnapshot | null = null
    for (const s of sorted) {
      const t = new Date(s.date).getTime()
      if (t <= targetTime) {
        baseline = s
      } else {
        break
      }
    }
    if (!baseline || baseline.followers <= 0) return null
    return Math.round(((latest.followers - baseline.followers) / baseline.followers) * 1000) / 10
  }

  let allTime: number | null = null
  if (sorted.length >= 2 && sorted[0].followers > 0) {
    allTime = Math.round(((latest.followers - sorted[0].followers) / sorted[0].followers) * 1000) / 10
  }

  return {
    d7: growthForDays(7),
    d30: growthForDays(30),
    d60: growthForDays(60),
    allTime,
  }
}

export function getPlatformDetail(
  accounts: SocialAccount[],
  snapshots: SocialSnapshot[],
  platform: string
): SocialPlatformDetail | null {
  const account = accounts.find((a) => a.platform === platform)
  if (!account) return null

  const accountSnapshots = snapshots
    .filter((s) => s.account_id === account.id)
    .sort((a, b) => a.date.localeCompare(b.date))

  const followers =
    accountSnapshots.length > 0
      ? accountSnapshots[accountSnapshots.length - 1].followers
      : account.followers

  const growth = computePlatformGrowth(accountSnapshots)

  return {
    account,
    followers,
    growth,
    snapshots: accountSnapshots,
  }
}

