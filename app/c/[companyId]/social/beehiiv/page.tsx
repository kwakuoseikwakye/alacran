import React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Mail } from "lucide-react";
import { getEffectiveAgents } from "@/lib/get-effective-agents";
import { readNewsletters } from "@/lib/os/newsletters/read";
import { NewsletterList } from "@/components/os/social/newsletter-list";

export const dynamic = "force-dynamic";

const fmt = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("en-US");
const pct = (n: number) => `${n.toFixed(1)}%`;

export default async function BeehiivDashboardPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId } = await params;

  const allAgents = await getEffectiveAgents();
  const agent = allAgents.find((a) => a.id === companyId);
  if (!agent) notFound();

  const { newsletters, subscribers, summary, isLive } =
    await readNewsletters(agent.rootPath);

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
          <div className="mb-1 flex items-center gap-2">
            <Mail className="h-4 w-4 text-os-accent" />
            <span className="font-mono text-[9.5px] uppercase tracking-[0.32em] text-os-dim">
              Beehiiv
            </span>
          </div>
          <h1 className="text-[25px] font-bold uppercase leading-[1.1] tracking-[0.06em] text-os-text">
            Newsletter
          </h1>
          <p className="mt-1 font-mono text-[11px] text-os-dim">
            {isLive
              ? "live via Beehiiv API"
              : "unconfigured · add BEEHIIV_API_KEY to connect"}
          </p>
        </div>
        <a
          href="https://app.beehiiv.com"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 rounded-lg border border-os-border px-3 py-1.5 text-xs text-os-muted transition-colors hover:border-os-border-strong hover:text-os-text"
        >
          Open Beehiiv
          <ExternalLink className="h-3 w-3" />
        </a>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-os-border bg-os-surface p-5">
          <div className="text-xs uppercase tracking-wider text-os-muted">
            Subscribers
          </div>
          <div className="mt-2 font-mono text-3xl font-bold tracking-tight text-os-text">
            {fmt(subscribers)}
          </div>
        </div>
        <div className="rounded-xl border border-os-border bg-os-surface p-5">
          <div className="text-xs uppercase tracking-wider text-os-muted">
            Newsletters sent
          </div>
          <div className="mt-2 font-mono text-3xl font-bold tracking-tight text-os-text">
            {fmt(summary.count)}
          </div>
        </div>
        <div className="rounded-xl border border-os-border bg-os-surface p-5">
          <div className="text-xs uppercase tracking-wider text-os-muted">
            Avg open rate
          </div>
          <div className="mt-2 font-mono text-3xl font-bold tracking-tight text-os-ok">
            {pct(summary.avgOpenRate)}
          </div>
        </div>
        <div className="rounded-xl border border-os-border bg-os-surface p-5">
          <div className="text-xs uppercase tracking-wider text-os-muted">
            Best open rate
          </div>
          <div className="mt-2 font-mono text-3xl font-bold tracking-tight text-os-text">
            {pct(summary.bestOpenRate)}
          </div>
        </div>
      </div>

      <section className="mt-8 space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-os-muted">
            Past newsletters
          </h2>
          <span className="font-mono text-[10px] text-os-dim">
            click any issue to expand its analytics
          </span>
        </div>
        <NewsletterList newsletters={newsletters} />
      </section>
    </div>
  );
}
