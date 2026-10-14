"use client"

import React, { useState } from "react"
import Link from "next/link"
import {
  Twitter,
  Linkedin,
  Youtube,
  Instagram,
  Github,
  Globe,
  Mail,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Clock,
  type LucideIcon,
} from "lucide-react"
import type { SocialViewModel } from "@/lib/os/departments/adapters/social-adapter"
import { PageHeader } from "@/components/os/dashboard/page-header"
import { Badge, SectionHead } from "@/components/os/terminal"
import { formatFollowers, formatPct } from "@/lib/os/departments/adapters/social-adapter"
import { RecencyDots } from "@/components/os/recency-dots"
import { SocialStatStrip } from "./social-stat-strip"
import { AudienceConsistency } from "./audience-consistency"
import { PostComposer } from "./post-composer"

const PLATFORM_ICONS: Record<string, LucideIcon> = {
  x: Twitter,
  linkedin: Linkedin,
  youtube: Youtube,
  instagram: Instagram,
  github: Github,
}

function useSafeState<T>(initial: T | (() => T)): [T, React.Dispatch<React.SetStateAction<T>>] {
  try {
    return useState<T>(initial)
  } catch {
    const val = typeof initial === "function" ? (initial as () => T)() : initial
    return [val, () => {}]
  }
}

export interface SocialDraftItem {
  id: string
  title: string
  channel?: string
  author?: "agent" | "human" | string
  status?: "draft" | "review" | "scheduled" | "published" | "rejected" | string
  type?: string
  summary?: string
  content?: string
  publish_date?: string
  url?: string
}

export interface SocialCockpitProps {
  model: SocialViewModel | Record<string, unknown>
  companyId: string
  publicationGateNotice?: boolean
  drafts?: SocialDraftItem[]
}

export function SocialCockpit({
  model,
  companyId,
  publicationGateNotice = true,
  drafts = [],
}: SocialCockpitProps) {
  const modelAsSocial = model as Partial<SocialViewModel>
  const rawAccounts = Array.isArray((model as { accounts?: unknown[] })?.accounts)
    ? ((model as { accounts: Array<Record<string, unknown>> }).accounts)
    : null

  const platforms =
    modelAsSocial.platforms ??
    (rawAccounts
      ? rawAccounts.map((a) => ({
          platform: String(a.platform || a.id || "other"),
          label: String(a.label || a.platform || "Platform"),
          handle: String(a.handle || `@${a.id || ""}`),
          url: String(a.url || "#"),
          followers: typeof a.followers === "number" ? a.followers : 0,
          growth: (a.growth as { d7: number | null; d30: number | null }) ?? { d7: null, d30: null },
        }))
      : [])

  const connectors = Array.isArray(modelAsSocial.connectors) ? modelAsSocial.connectors : []
  const statsFallback = (model as { stats?: { totalFollowers?: number; weeklyGrowthRate?: number; totalEngagement?: number } })?.stats
  const totalReach = modelAsSocial.totalReach ?? statsFallback?.totalFollowers ?? 0

  const statStrip = modelAsSocial.statStrip ?? {
    audienceTotal: totalReach,
    growth7d: statsFallback?.weeklyGrowthRate ?? 0,
    growth30d: null,
    totalImpressions: 0,
    totalEngagements: statsFallback?.totalEngagement ?? 0,
  }

  const rawChartData = Array.isArray((model as { chartData?: unknown[] })?.chartData)
    ? (model as { chartData: Array<Record<string, unknown>> }).chartData
    : null

  const audiencePoints =
    modelAsSocial.audiencePoints ??
    (rawChartData
      ? rawChartData.map((d) => ({
          date: String(d.date || ""),
          total: typeof d.total === "number" ? d.total : typeof d.followers === "number" ? d.followers : 0,
        }))
      : [])

  const pieItems = Array.isArray(modelAsSocial.pieItems) ? modelAsSocial.pieItems : []
  const recentPosts = Array.isArray(modelAsSocial.recentPosts) ? modelAsSocial.recentPosts : []
  const isLive = Boolean(modelAsSocial.isLive)

  const connectedCount = connectors.filter((c) => c.status === "connected").length

  const [reviewStatus, setReviewStatus] = useSafeState<Record<string, "approved" | "rejected">>({})

  const handleApprove = (id: string) => {
    setReviewStatus((prev) => ({ ...prev, [id]: "approved" }))
  }

  const handleReject = (id: string) => {
    setReviewStatus((prev) => ({ ...prev, [id]: "rejected" }))
  }

  const draftList = drafts ?? []

  return (
    <div className="dash-content space-y-6 pb-12">
      <PageHeader
        title="Distribution Channels"
        right={
          <div className="flex items-center gap-2">
            <Badge tone="warn">
              §6 Publication Gate Active
            </Badge>
            <Badge tone={isLive ? "ok" : "default"}>
              ● {isLive ? `${connectedCount} live` : "local records"}
            </Badge>
          </div>
        }
      />

      {/* §6 Publication Gate Banner */}
      {publicationGateNotice && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-amber-500">
                  <ShieldAlert className="h-3.5 w-3.5" />
                  §6 Publication Gate
                </span>
                <span className="font-mono text-[11px] text-os-dim">AGENTS.md §6</span>
              </div>
              <div className="font-mono text-[13px] font-medium text-os-text">
                &ldquo;Anything leaving the company — customer email, posts, investor updates, release announcements. Write it. Show it. Never send it.&rdquo;
              </div>
              <p className="text-[12px] leading-relaxed text-os-dim">
                Autonomous agents prepare, format, and stage outbound distribution content. Outbound network transmission is strictly blocked until explicit human approval.
              </p>
            </div>
            <div className="shrink-0 pt-1 sm:pt-0">
              <span className="inline-flex items-center gap-1 rounded-md border border-os-border bg-os-surface px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-os-dim">
                <CheckCircle2 className="h-3 w-3 text-os-ok" />
                Gate Active
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Outbound Draft Review Queue */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <SectionHead
            label="Outbound Draft Review Queue"
            count={
              draftList.length > 0
                ? `${draftList.length} awaiting human sign-off`
                : "0 pending"
            }
          />
        </div>
        <p className="mb-3 text-[12px] text-os-dim">
          Content staged by autonomous agents under §6 Publication Gate rules. Requires explicit operator verification before transmission.
        </p>

        {draftList.length === 0 ? (
          <div className="rounded-lg border border-os-border bg-os-surface p-5 text-center">
            <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-os-surface2 text-os-ok mb-2">
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <div className="font-mono text-[12px] font-semibold text-os-text">
              All Gates Clear (0 pending)
            </div>
            <p className="mt-1 text-[11.5px] text-os-dim max-w-md mx-auto">
              No outbound communications currently awaiting review. When agents generate outbound posts, newsletters, or releases, they stage here for human approval.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {draftList.map((draft) => {
              const state = reviewStatus[draft.id]
              return (
                <div
                  key={draft.id}
                  className="flex flex-col justify-between rounded-lg border border-os-border bg-os-surface p-4 transition-colors hover:border-os-border-strong"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1 rounded-xs border border-os-border bg-os-surface2 px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-wider text-os-dim">
                        {draft.channel || "outbound"}
                      </span>
                      {state === "approved" ? (
                        <span className="inline-flex items-center gap-1 rounded-xs border border-os-ok/30 bg-os-ok/10 px-1.5 py-0.5 font-mono text-[9.5px] font-medium text-os-ok">
                          <CheckCircle2 className="h-3 w-3" /> Approved by Human
                        </span>
                      ) : state === "rejected" ? (
                        <span className="inline-flex items-center gap-1 rounded-xs border border-os-err/30 bg-os-err/10 px-1.5 py-0.5 font-mono text-[9.5px] font-medium text-os-err">
                          <XCircle className="h-3 w-3" /> Rejected at Gate
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-xs border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[9.5px] font-medium text-amber-500">
                          §6 Gate Required
                        </span>
                      )}
                    </div>
                    <h4 className="mt-2 text-[13px] font-semibold text-os-text line-clamp-1">
                      {draft.title}
                    </h4>
                    <p className="mt-1.5 text-[11.5px] leading-relaxed text-os-dim line-clamp-3">
                      {draft.summary || draft.content || "Draft content prepared for distribution."}
                    </p>
                  </div>

                  <div className="mt-4 pt-3 border-t border-os-border/50 flex items-center justify-between gap-2">
                    {state === "approved" ? (
                      <span className="font-mono text-[10px] text-os-ok">
                        Ready for Egress
                      </span>
                    ) : state === "rejected" ? (
                      <span className="font-mono text-[10px] text-os-err">
                        Egress Blocked
                      </span>
                    ) : (
                      <span className="font-mono text-[10px] text-amber-500/90 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Awaiting Human Sign-Off
                      </span>
                    )}

                    {!state && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleApprove(draft.id)}
                          className="rounded-xs border border-os-ok/40 bg-os-ok/10 px-2 py-0.5 font-mono text-[10px] font-medium text-os-ok hover:bg-os-ok/20 transition-colors cursor-pointer"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReject(draft.id)}
                          className="rounded-xs border border-os-border bg-os-surface px-2 py-0.5 font-mono text-[10px] text-os-dim hover:text-os-text transition-colors cursor-pointer"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Distribution Channels Grid */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <SectionHead
            label="Distribution Channels"
            count={`${formatFollowers(totalReach)} total reach`}
          />
        </div>
        <p className="mb-3 text-[12px] text-os-dim">
          Outbound distribution channels wired to external publishing platforms under human gate control.
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {platforms.map((p) => {
            const Icon = PLATFORM_ICONS[p.platform] ?? Globe
            const share = totalReach > 0 ? (p.followers / totalReach) * 100 : 0

            return (
              <Link
                key={p.platform}
                href={`/c/${companyId}/social/${p.platform}`}
                className="group block rounded-lg border border-os-border bg-os-surface p-4 transition-colors hover:border-os-border-strong"
              >
                <div className="flex items-center gap-2">
                  <Icon className="h-4 w-4 shrink-0 text-os-text" />
                  <span className="truncate font-mono text-[10px] uppercase tracking-[0.1em] text-os-dim">
                    {p.label}
                  </span>
                  <span
                    className={`ml-auto shrink-0 font-mono text-[10px] ${
                      p.growth?.d7 == null
                        ? "text-os-dim"
                        : p.growth.d7 >= 0
                        ? "text-os-ok"
                        : "text-os-err"
                    }`}
                  >
                    {formatPct(p.growth?.d7)}
                  </span>
                </div>
                <div className="mt-3 font-mono text-[24px] font-semibold leading-none tracking-[-0.02em] text-os-text">
                  {formatFollowers(p.followers)}
                </div>
                <div className="mt-1.5 truncate font-mono text-[9.5px] text-os-dim">
                  {p.handle}
                </div>
                <div className="mt-3 h-1 overflow-hidden rounded-xs bg-os-surface2">
                  <div
                    className="h-full bg-os-accent opacity-60"
                    style={{ width: `${share}%` }}
                  />
                </div>
              </Link>
            )
          })}

          {/* Beehiiv Newsletter Card */}
          <Link
            href={`/c/${companyId}/social/beehiiv`}
            className="group block rounded-lg border border-os-border bg-os-surface p-4 transition-colors hover:border-os-border-strong"
          >
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 shrink-0 text-os-accent" />
              <span className="truncate font-mono text-[10px] uppercase tracking-[0.1em] text-os-dim">
                Newsletter
              </span>
              <span className="ml-auto shrink-0 font-mono text-[10px] text-os-dim">
                connect →
              </span>
            </div>
            <div className="mt-3 font-mono text-[24px] font-semibold leading-none tracking-[-0.02em] text-os-dim">
              —
            </div>
            <div className="mt-1.5 truncate font-mono text-[9.5px] text-os-dim">
              Beehiiv · Unconfigured
            </div>
            <div className="mt-3 h-1 overflow-hidden rounded-xs bg-os-surface2">
              <div
                className="h-full bg-os-accent opacity-60"
                style={{ width: "0%" }}
              />
            </div>
          </Link>
        </div>
      </section>

      {/* Social Stat Strip */}
      <SocialStatStrip stats={statStrip} platformsCount={platforms.length} />

      {/* Audience Consistency and Share Donut */}
      <AudienceConsistency
        points={audiencePoints}
        pieItems={pieItems}
        total={totalReach}
      />

      {/* Recent Posts */}
      {recentPosts.length > 0 && (
        <section>
          <SectionHead label="Recent posts" count={`${recentPosts.length} published`} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {recentPosts.map((post) => (
              <div
                key={post.id}
                className="flex flex-col justify-between rounded-lg border border-os-border bg-os-surface p-3.5"
              >
                <div>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-os-dim">
                      {post.tag}
                    </span>
                    <span className="font-mono text-[10px] text-os-dim">{post.ago}</span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-[12.5px] leading-snug text-os-text">
                    {post.caption}
                  </p>
                </div>
                <div className="mt-3 border-t border-os-border/50 pt-2">
                  <div className="flex items-baseline justify-between font-mono text-[10.5px]">
                    <span className="text-os-dim">{formatFollowers(post.views)} views</span>
                    <span className="text-os-accent">{post.ratio?.toFixed(1)}% L/V</span>
                  </div>
                  <RecencyDots rank={post.rank} of={post.total} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Post Composer */}
      <section>
        <PostComposer companyId={companyId} />
      </section>
    </div>
  )
}

