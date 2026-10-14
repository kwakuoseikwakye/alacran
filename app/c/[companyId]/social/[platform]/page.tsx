import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { getEffectiveAgents } from "@/lib/get-effective-agents";
import { readSocialAccounts, readSocialSnapshots } from "@/lib/os/records/read";
import type {
  SocialAccount,
  SocialPlatform,
} from "@/lib/os/schemas/social";
import {
  PLATFORM_LABELS,
  getPlatformDetail,
  formatFollowers,
  formatPct,
} from "@/lib/os/departments/adapters/social-adapter";
import { GrowthBadge } from "@/components/os/social/growth-badge";
import { FollowerBarChart } from "@/components/os/social/follower-bar-chart";

export const dynamic = "force-dynamic";

export default async function SocialPlatformPage({
  params,
}: {
  params: Promise<{ companyId: string; platform: string }>;
}) {
  const { companyId, platform } = await params;

  const allAgents = await getEffectiveAgents();
  const agent = allAgents.find((a) => a.id === companyId);
  if (!agent) notFound();

  const [accountsResult, snapshotsResult] = await Promise.all([
    readSocialAccounts(agent.rootPath),
    readSocialSnapshots(agent.rootPath),
  ]);

  let detail = getPlatformDetail(
    accountsResult.records,
    snapshotsResult.records,
    platform,
  );

  if (!detail && PLATFORM_LABELS[platform]) {
    const slug = agent.name.toLowerCase().replace(/[^a-z0-9]/g, "");
    const fallbackAccount: SocialAccount = {
      id: `${platform}-${slug || "company"}`,
      platform: platform as SocialPlatform,
      handle: `@${slug || "company"} · not connected`,
      url: "",
      followers: 0,
      last_sync: "",
    };
    detail = {
      account: fallbackAccount,
      followers: 0,
      growth: { d7: null, d30: null, d60: null, allTime: null },
      snapshots: [],
    };
  }

  if (!detail) notFound();

  const { account, followers, growth, snapshots } = detail;
  const newestFirst = [...snapshots].reverse();

  return (
    <div className="dash-content space-y-6 pb-12">
      <Link
        href={`/c/${companyId}/social`}
        className="inline-flex items-center gap-1.5 text-xs text-os-muted transition-colors hover:text-os-text"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        All platforms
      </Link>

      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-os-border/50 pb-5">
        <div>
          <h1 className="text-[25px] font-bold uppercase leading-[1.1] tracking-[0.06em] text-os-text">
            {PLATFORM_LABELS[account.platform] || account.platform}
          </h1>
          <p className="mt-1 font-mono text-sm text-os-muted">{account.handle}</p>
        </div>
        {account.url && (
          <a
            href={account.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-os-border px-3 py-1.5 text-xs text-os-muted transition-colors hover:border-os-border-strong hover:text-os-text"
          >
            Open profile
            <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <div className="rounded-xl border border-os-border bg-os-surface p-5">
          <div className="text-xs uppercase tracking-wider text-os-muted">
            Followers
          </div>
          <div className="mt-2 font-mono text-3xl font-bold tracking-tight text-os-text">
            {formatFollowers(followers)}
          </div>
        </div>
        {(
          [
            ["Growth · 7d", growth.d7],
            ["Growth · 30d", growth.d30],
            ["Growth · 60d", growth.d60],
            ["Growth · all time", growth.allTime],
          ] as const
        ).map(([label, value]) => (
          <div
            key={label}
            className="rounded-xl border border-os-border bg-os-surface p-5"
          >
            <div className="text-xs uppercase tracking-wider text-os-muted">
              {label}
            </div>
            <div
              className={`mt-2 font-mono text-3xl font-bold tracking-tight ${
                value === null
                  ? "text-os-dim"
                  : value >= 0
                  ? "text-os-ok"
                  : "text-os-err"
              }`}
            >
              {formatPct(value)}
            </div>
          </div>
        ))}
      </div>

      <section className="rounded-xl border border-os-border bg-os-surface p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-os-muted">
            Follower history
          </h2>
          <div className="flex gap-1.5">
            <GrowthBadge label="7d" value={growth.d7} />
            <GrowthBadge label="30d" value={growth.d30} />
            <GrowthBadge label="60d" value={growth.d60} />
            <GrowthBadge label="all" value={growth.allTime} />
          </div>
        </div>

        <FollowerBarChart
          series={snapshots.map((s) => ({ date: s.date, followers: s.followers }))}
        />

        {newestFirst.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-os-border/40 pt-3 font-mono text-[9.5px] uppercase tracking-[0.08em] text-os-dim">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-[2px] w-3 bg-os-ok" /> gained vs prev
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-[2px] w-3 bg-os-err" /> dipped
            </span>
            <span className="ml-auto">
              {newestFirst.length} snapshots · latest {newestFirst[0].date}
            </span>
          </div>
        )}
      </section>
    </div>
  );
}
