"use client"

import React from "react"
import Link from "next/link"
import {
  Brain,
  BarChart3,
  ExternalLink,
  Clapperboard,
  Play,
  ArrowUpRight,
} from "lucide-react"
import type { ContentViewModel } from "@/lib/os/departments/adapters/content-adapter"
import { PageHeader } from "@/components/os/dashboard/page-header"
import { Badge, SectionHead } from "@/components/os/terminal"
import { AgentCard } from "./agent-card"
import { LeadMagnetsTable } from "./lead-magnets-table"

export function ContentCockpit({
  model,
  companyId,
}: {
  model: ContentViewModel
  companyId: string
}) {
  const { crew, pipeline, leadMagnets, activeDays, isLive } = model
  const leadAgent = crew.find((a) => a.isLead)
  const workerAgents = crew.filter((a) => !a.isLead)

  return (
    <div className="dash-content space-y-8 pb-12">
      <PageHeader
        title="Content Creation"
        right={
          <div className="flex items-center gap-2">
            <Badge tone={isLive ? "ok" : "default"}>
              ● {isLive ? "pipeline connected" : "local records"}
            </Badge>
            <Badge tone="accent">{crew.length} agents</Badge>
          </div>
        }
      />

      {/* Content Intelligence Backlinks */}
      <section>
        <SectionHead label="Content intelligence" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href={`/c/${companyId}/brain`}
            className="group flex items-start gap-3 rounded-lg border border-os-border bg-os-surface p-4 transition-colors hover:border-os-border-strong"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-os-border bg-os-surface2 text-os-accent">
              <Brain className="h-4 w-4" strokeWidth={1.8} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-[13.5px] font-semibold text-os-text">
                Autonomous Research
                <ArrowUpRight className="h-3.5 w-3.5 text-os-dim transition-colors group-hover:text-os-accent" />
              </span>
              <span className="mt-0.5 block text-[12px] leading-relaxed text-os-dim">
                Company knowledge core — research, ontology facts, and signals feeding content creation.
              </span>
              <span className="mt-1.5 block truncate font-mono text-[10px] text-os-muted">
                Knowledge Core · /c/{companyId}/brain
              </span>
            </span>
          </Link>

          <Link
            href={`/c/${companyId}/analytics`}
            className="group flex items-start gap-3 rounded-lg border border-os-border bg-os-surface p-4 transition-colors hover:border-os-border-strong"
          >
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-os-border bg-os-surface2 text-os-accent">
              <BarChart3 className="h-4 w-4" strokeWidth={1.8} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 text-[13.5px] font-semibold text-os-text">
                Performance Analytics
                <ArrowUpRight className="h-3.5 w-3.5 text-os-dim transition-colors group-hover:text-os-accent" />
              </span>
              <span className="mt-0.5 block text-[12px] leading-relaxed text-os-dim">
                Cross-department performance telemetry, reach curves, and plain-file activity.
              </span>
              <span className="mt-1.5 block truncate font-mono text-[10px] text-os-muted">
                Executive Analytics · /c/{companyId}/analytics
              </span>
            </span>
          </Link>
        </div>
      </section>

      {/* Content Agents Crew */}
      <section>
        <SectionHead label="Content agents" count={`${crew.length}`} />
        <p className="mb-3 flex items-center gap-1.5 text-xs text-os-dim">
          <Clapperboard className="h-3.5 w-3.5" /> Tied to social media — inspect skills in{" "}
          <Link
            href={`/c/${companyId}/skills`}
            className="inline-flex items-center gap-0.5 text-os-accent hover:underline"
          >
            Skills &amp; Capabilities <ArrowUpRight className="h-3 w-3" />
          </Link>
        </p>
        {leadAgent && <AgentCard agent={leadAgent} lead />}
        {workerAgents.length > 0 && (
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {workerAgents.map((a) => (
              <AgentCard key={a.id} agent={a} />
            ))}
          </div>
        )}
      </section>

      {/* Content Pipeline */}
      <section>
        <SectionHead
          label="Content pipeline"
          count={pipeline.length > 0 ? `${pipeline.length} items` : "no entries"}
        />
        <p className="mb-3 flex items-center gap-1.5 text-xs text-os-dim">
          Published across channels · {activeDays} active days tracked · full dashboard in{" "}
          <Link
            href={`/c/${companyId}/social`}
            className="inline-flex items-center gap-0.5 text-os-accent hover:underline"
          >
            Social <ArrowUpRight className="h-3 w-3" />
          </Link>
        </p>
        {pipeline.length > 0 ? (
          <ul className="flex flex-col divide-y divide-os-border overflow-hidden rounded-lg border border-os-border bg-os-surface">
            {pipeline.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-2.5">
                <Play className="h-3.5 w-3.5 shrink-0 text-os-dim" />
                <span className="w-24 shrink-0 font-mono text-[10.5px] uppercase tracking-wide text-os-muted">
                  {p.platform}
                </span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-os-text">
                  {p.caption}
                </span>
                {p.url ? (
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 text-os-dim hover:text-os-accent"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : null}
                <span className="w-12 shrink-0 text-right font-mono text-[10px] text-os-dim">
                  {p.ago}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-lg border border-dashed border-os-border bg-os-surface px-4 py-6 text-center font-mono text-[11.5px] text-os-dim">
            No published items recorded in records/content/items.yaml yet.
          </p>
        )}
      </section>

      {/* Lead Magnets Register */}
      <section>
        <SectionHead
          label="Lead magnets"
          count={`${leadMagnets.filter((m) => m.status === "live").length} live`}
        />
        <p className="mb-3 flex items-center gap-1.5 text-xs text-os-dim">
          Every landing page shipped behind a post ·{" "}
          <Link
            href={`/c/${companyId}/content/lead-magnets`}
            className="inline-flex items-center gap-0.5 text-os-accent hover:underline"
          >
            Open the register <ArrowUpRight className="h-3 w-3" />
          </Link>
        </p>
        <LeadMagnetsTable rows={leadMagnets.slice(0, 4)} />
      </section>
    </div>
  )
}
