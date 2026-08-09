"use client"

import { useState } from "react"
import { Bot } from "lucide-react"
import { BrandIcon, type BrandId } from "@/components/brand-icon"
import { AgentAvatar } from "@/components/agent-avatar"
import { TOOL_BRAND } from "@/components/connect-panel"
import { getAiExecutor, type AiExecutorId } from "@/lib/ai-executors"
import type { NetworkMap, NetworkService } from "@/lib/build-network-map"

// Every row (company or service) occupies one PITCH-tall slot, vertically
// centered inside it — that's what lets the connector paths below be plain
// arithmetic (index * PITCH + PITCH / 2) instead of something that has to
// measure the real DOM with a ResizeObserver. Trades "content can never be
// taller than a slot" for "zero client-side layout pass"; chip rows scroll
// horizontally instead of wrapping so that trade always holds.
const PITCH = 100

const SHORT_EXECUTOR_LABEL: Record<AiExecutorId, string> = {
  "claude-code": "Claude Code",
  "openai-codex": "Codex",
  aider: "Aider",
  "google-antigravity": "Antigravity",
}

const SERVICE_META: Record<NetworkService, { label: string; brand: BrandId }> = {
  google: { label: "Google", brand: "google" },
  github: { label: "GitHub", brand: "github" },
  notion: { label: "Notion", brand: "notion" },
}

type ServiceNode =
  | { key: string; type: "executor"; id: AiExecutorId; label: string; title: string }
  | { key: string; type: "integration"; id: NetworkService; label: string; title: string; connected: number; total: number }

type HoverTarget = { companyId?: string; serviceKey?: string } | null

function ServiceIcon({ node }: { node: ServiceNode }) {
  if (node.type === "executor") {
    const brand = TOOL_BRAND[node.id]
    return brand ? (
      <BrandIcon id={brand} tone="brand" className="size-4" />
    ) : (
      <Bot className="size-4 text-muted-foreground" aria-label={node.label} />
    )
  }
  return <BrandIcon id={SERVICE_META[node.id].brand} tone="brand" className="size-4" />
}

function EdgeChip({ connected, label, detail }: { connected: boolean; label: string; detail: string }) {
  return (
    <span
      title={detail}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] whitespace-nowrap ${
        connected
          ? "border-success/30 bg-success/10 text-success"
          : "border-border text-muted-foreground opacity-60"
      }`}
    >
      <span className={`size-1.5 shrink-0 rounded-full ${connected ? "bg-success" : "bg-muted-foreground"}`} />
      {label}
    </span>
  )
}

/**
 * The /network tab's connectivity map: every company on the left, every
 * service it can plug into on the right, curved "cable" edges between them —
 * solid + green where a real connection exists, dashed + faded where it
 * doesn't. Deliberately not an Obsidian-style force graph (nothing here
 * needs physics — the relationships are known, not discovered), and
 * deliberately not per-vendor-colored wires either: this app's own house
 * style keeps vendor color for icons only (BrandIcon's tone="brand"), so the
 * wires speak the app's existing semantic palette instead — ember for "runs
 * on" (always true, not a connect/disconnect state), success-green for a
 * real connection, muted dashes for "not yet."
 */
export function NetworkGraph({
  data,
  avatarByAgentId,
}: {
  data: NetworkMap
  avatarByAgentId: Record<string, string | null>
}) {
  const [hover, setHover] = useState<HoverTarget>(null)

  const integrationServices = (Object.keys(SERVICE_META) as NetworkService[]).filter((service) =>
    data.companies.some((c) => c.edges.some((e) => e.service === service))
  )

  const serviceNodes: ServiceNode[] = [
    ...data.executorsInUse.map(
      (id): ServiceNode => ({
        key: `executor:${id}`,
        type: "executor",
        id,
        label: SHORT_EXECUTOR_LABEL[id],
        title: getAiExecutor(id).label,
      })
    ),
    ...integrationServices.map((service): ServiceNode => {
      const eligible = data.companies.filter((c) => c.edges.some((e) => e.service === service))
      const connected = eligible.filter((c) => c.edges.find((e) => e.service === service)?.connected).length
      return {
        key: `integration:${service}`,
        type: "integration",
        id: service,
        label: SERVICE_META[service].label,
        title: SERVICE_META[service].label,
        connected,
        total: eligible.length,
      }
    }),
  ]

  const serviceIndex = new Map(serviceNodes.map((n, i) => [n.key, i]))
  const totalRows = Math.max(data.companies.length, serviceNodes.length, 1)
  const height = totalRows * PITCH

  const yFor = (index: number) => index * PITCH + PITCH / 2

  type Wire = { id: string; d: string; connected: boolean; kind: "executor" | "integration"; companyId: string; serviceKey: string }
  const wires: Wire[] = []
  data.companies.forEach((company, ci) => {
    const y0 = yFor(ci)
    if (company.aiExecutorId) {
      const key = `executor:${company.aiExecutorId}`
      const si = serviceIndex.get(key)
      if (si !== undefined) {
        const y1 = yFor(si)
        wires.push({
          id: `${company.id}-${key}`,
          d: `M 0 ${y0} C 50 ${y0}, 50 ${y1}, 100 ${y1}`,
          connected: true,
          kind: "executor",
          companyId: company.id,
          serviceKey: key,
        })
      }
    }
    company.edges.forEach((edge) => {
      const key = `integration:${edge.service}`
      const si = serviceIndex.get(key)
      if (si === undefined) return
      const y1 = yFor(si)
      wires.push({
        id: `${company.id}-${key}`,
        d: `M 0 ${y0} C 50 ${y0}, 50 ${y1}, 100 ${y1}`,
        connected: edge.connected,
        kind: "integration",
        companyId: company.id,
        serviceKey: key,
      })
    })
  })

  function isDimmed(companyId?: string, serviceKey?: string): boolean {
    if (!hover) return false
    if (hover.companyId && companyId !== undefined) return hover.companyId !== companyId
    if (hover.serviceKey && serviceKey !== undefined) return hover.serviceKey !== serviceKey
    return false
  }

  return (
    <div className="netgraph a-rise">
      <div className="netgraph-legend">
        <span className="netgraph-legend-item">
          <span className="netgraph-legend-swatch netgraph-legend-swatch--executor" /> Runs on
        </span>
        <span className="netgraph-legend-item">
          <span className="netgraph-legend-swatch netgraph-legend-swatch--on" /> Connected
        </span>
        <span className="netgraph-legend-item">
          <span className="netgraph-legend-swatch netgraph-legend-swatch--off" /> Not connected
        </span>
      </div>

      <div className="netgraph-grid" style={{ "--netgraph-h": `${height}px` } as React.CSSProperties}>
        <div className="netgraph-col netgraph-companies">
          {data.companies.map((company) => {
            const dimmed = isDimmed(company.id, undefined)
            return (
              <div
                key={company.id}
                className={`netgraph-node netgraph-company${dimmed ? " is-dimmed" : ""}`}
                style={{ "--pitch": `${PITCH}px` } as React.CSSProperties}
                onMouseEnter={() => setHover({ companyId: company.id })}
                onMouseLeave={() => setHover(null)}
              >
                <div className="netgraph-card">
                  <div className="netgraph-card-top">
                    <AgentAvatar imageUrl={avatarByAgentId[company.id] ?? null} />
                    <span className="netgraph-card-name truncate">{company.name}</span>
                    <span className="netgraph-card-kind">{company.kind}</span>
                  </div>
                  <div className="netgraph-chips">
                    {company.aiExecutorId && (
                      <span
                        title={getAiExecutor(company.aiExecutorId).label}
                        className="inline-flex shrink-0 items-center gap-1 rounded-full border border-ember/30 bg-ember/10 px-2 py-0.5 text-[10px] whitespace-nowrap text-ember"
                      >
                        <span className="size-1.5 shrink-0 rounded-full bg-ember" />
                        {SHORT_EXECUTOR_LABEL[company.aiExecutorId]}
                      </span>
                    )}
                    {company.edges.map((edge) => (
                      <EdgeChip
                        key={edge.service}
                        connected={edge.connected}
                        label={SERVICE_META[edge.service].label}
                        detail={edge.detail}
                      />
                    ))}
                    {company.edges.length === 0 && !company.aiExecutorId && (
                      <span className="text-[10px] text-muted-foreground opacity-70">Not connected to anything</span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <svg
          className="netgraph-wires"
          viewBox={`0 0 100 ${height}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {wires.map((wire) => {
            const dimmed = isDimmed(wire.companyId, wire.serviceKey)
            const cls =
              wire.kind === "executor"
                ? "netgraph-wire netgraph-wire--executor"
                : wire.connected
                  ? "netgraph-wire netgraph-wire--on"
                  : "netgraph-wire netgraph-wire--off"
            return <path key={wire.id} d={wire.d} className={`${cls}${dimmed ? " is-dimmed" : ""}`} />
          })}
        </svg>

        <div className="netgraph-col netgraph-services">
          {serviceNodes.map((node) => {
            const dimmed = isDimmed(undefined, node.key)
            return (
              <div
                key={node.key}
                className={`netgraph-node netgraph-service${dimmed ? " is-dimmed" : ""}`}
                style={{ "--pitch": `${PITCH}px` } as React.CSSProperties}
                onMouseEnter={() => setHover({ serviceKey: node.key })}
                onMouseLeave={() => setHover(null)}
              >
                <div className="netgraph-card netgraph-card--service" title={node.title}>
                  <span className="netgraph-service-icon">
                    <ServiceIcon node={node} />
                  </span>
                  <span className="netgraph-card-name truncate">{node.label}</span>
                  {node.type === "integration" && (
                    <span className="netgraph-service-count">
                      {node.connected}/{node.total}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
          {serviceNodes.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No company here uses a service this map tracks yet.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
