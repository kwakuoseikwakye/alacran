"use client"

import React, { useState } from "react"
import { RefreshCw, Sparkles, Key, Terminal, Layers } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/os/dashboard/page-header"
import { SectionHead } from "@/components/os/terminal"
import { ConnectHelp } from "@/components/connect-help"
import { ConnectionCard } from "./connection-card"
import { IntegrationCategory } from "./integration-category"
import { ApiKeys } from "./api-keys"
import { useAdvancedMode } from "@/components/advanced-only"
import {
  integrationsByCategory,
  type CatalogEntry,
  type ConnectionMechanism,
} from "@/lib/os/connectors/integrations-catalog"
import { recheckAllConnectionsState } from "@/lib/connect/connect-actions"
import type { ConnectStatus } from "@/lib/connect/connect-status-impl"

const GRID = "grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"

export function UnifiedConnectionsBoard({
  initialConnectStatus,
  initialCatalog,
}: {
  initialConnectStatus: ConnectStatus
  initialCatalog: CatalogEntry[]
  initialViewMode?: string
}) {
  const [connectStatus, setConnectStatus] = useState<ConnectStatus>(initialConnectStatus)
  const [catalog, setCatalog] = useState<CatalogEntry[]>(initialCatalog)
  const [mechanismFilter, setMechanismFilter] = useState<"all" | ConnectionMechanism>("all")
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(false)

  async function handleRecheck() {
    setPending(true)
    setError(false)
    try {
      const refreshed = await recheckAllConnectionsState()
      setConnectStatus(refreshed.connectStatus)
      setCatalog(refreshed.catalog)
    } catch {
      setError(true)
    } finally {
      setPending(false)
    }
  }

  const advanced = useAdvancedMode()
  const byId = new Map(catalog.map((c) => [c.slug, c]))
  // The three that gate a first win, first — they used to be indistinguishable
  // from 60 others, grouped by how they connect rather than what they're for.
  const essentialSlugs = ["claude-code", "google", "beeper"]
  const essentials = essentialSlugs.flatMap((slug) => byId.get(slug) ?? [])
  const yourTools = catalog.filter((c) => (c.connected || c.keySaved) && !essentialSlugs.includes(c.slug))
  const popular = catalog.filter((c) => c.popular && !essentialSlugs.includes(c.slug) && !c.connected && !c.keySaved)
  const categories = [...integrationsByCategory().entries()]

  const mcpCount = catalog.filter((c) => c.mechanism === "mcp").length
  const apiKeyCount = catalog.filter((c) => c.mechanism === "api-key").length
  const cliCount = catalog.filter((c) => c.mechanism === "cli").length

  const filteredEntries =
    mechanismFilter === "all" ? catalog : catalog.filter((c) => c.mechanism === mechanismFilter)

  const anyNotConnected =
    catalog.some((c) => c.popular && !c.connected) ||
    connectStatus.aiExecutors.some((t) => !t.connected) ||
    !connectStatus.google.connected ||
    !connectStatus.github.connected ||
    !connectStatus.beeper.connected

  return (
    <div className="dash-content space-y-6 pb-12">
      <PageHeader
        title="Connections"
        right={
          <div className="flex items-center gap-2.5">
            {/* Re-check button */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleRecheck}
              disabled={pending}
              className="h-8 border-os-border bg-os-surface text-xs text-os-text hover:border-os-border-strong hover:bg-os-surface2 cursor-pointer"
            >
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${pending ? "animate-spin" : ""}`} />
              {pending ? "Checking…" : "Re-check"}
            </Button>

            {/* Connect Help Modal */}
            <ConnectHelp anyNotConnected={anyNotConnected} />
          </div>
        }
      />

      {error && (
        <div className="rounded-lg border border-os-err/40 bg-os-err/10 px-4 py-2 text-xs text-os-err font-mono">
          Failed to re-check connections. Please click Re-check to retry.
        </div>
      )}

      {/* How a tool connects is an implementation detail: Advanced only. */}
      {advanced && (
      <div className="flex flex-wrap items-center gap-2 border-b border-os-border pb-3">
        <button
          type="button"
          onClick={() => setMechanismFilter("all")}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-xs transition-colors cursor-pointer ${
            mechanismFilter === "all"
              ? "bg-os-text text-os-bg font-semibold"
              : "border border-os-border bg-os-surface text-os-muted hover:border-os-border-strong hover:text-os-text"
          }`}
        >
          <Layers className="h-3 w-3" />
          <span>All ({catalog.length})</span>
        </button>

        <button
          type="button"
          onClick={() => setMechanismFilter("mcp")}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-xs transition-colors cursor-pointer ${
            mechanismFilter === "mcp"
              ? "border border-purple-500/50 bg-purple-500/20 text-purple-300 font-semibold"
              : "border border-os-border bg-os-surface text-os-muted hover:border-purple-500/40 hover:text-purple-300"
          }`}
        >
          <Sparkles className="h-3 w-3 text-purple-400" />
          <span>MCP Servers ({mcpCount})</span>
        </button>

        <button
          type="button"
          onClick={() => setMechanismFilter("api-key")}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-xs transition-colors cursor-pointer ${
            mechanismFilter === "api-key"
              ? "border border-amber-500/50 bg-amber-500/20 text-amber-300 font-semibold"
              : "border border-os-border bg-os-surface text-os-muted hover:border-amber-500/40 hover:text-amber-300"
          }`}
        >
          <Key className="h-3 w-3 text-amber-400" />
          <span>API Keys ({apiKeyCount})</span>
        </button>

        <button
          type="button"
          onClick={() => setMechanismFilter("cli")}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-xs transition-colors cursor-pointer ${
            mechanismFilter === "cli"
              ? "border border-cyan-500/50 bg-cyan-500/20 text-cyan-300 font-semibold"
              : "border border-os-border bg-os-surface text-os-muted hover:border-cyan-500/40 hover:text-cyan-300"
          }`}
        >
          <Terminal className="h-3 w-3 text-cyan-400" />
          <span>CLI Bridges ({cliCount})</span>
        </button>
      </div>
      )}

      {/* Mechanism Guidance Explainer */}
      {!advanced ? null : mechanismFilter === "mcp" ? (
        <div className="rounded-xl border border-purple-500/25 bg-purple-500/5 p-3.5 text-xs text-purple-300 font-mono flex items-start gap-2.5">
          <Sparkles className="h-4 w-4 shrink-0 text-purple-400 mt-0.5" />
          <div>
            <span className="font-semibold text-purple-200">Model Context Protocol (MCP) Tools</span>: The pool
            every company picks from. Adding one here makes it available everywhere; each company chooses which
            of these its own AI may use in Company Info &amp; Settings. No API keys pasted here.
          </div>
        </div>
      ) : mechanismFilter === "api-key" ? (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3.5 text-xs text-amber-300 font-mono flex items-start gap-2.5">
          <Key className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
          <div>
            <span className="font-semibold text-amber-200">Direct API Keys & Webhook Secrets</span>: The default
            for every company, stored locally in <code>.env.local</code> (gitignored). A company with its own
            account for one of these can set its own key instead, in Company Info &amp; Settings.
          </div>
        </div>
      ) : mechanismFilter === "cli" ? (
        <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/5 p-3.5 text-xs text-cyan-300 font-mono flex items-start gap-2.5">
          <Terminal className="h-4 w-4 shrink-0 text-cyan-400 mt-0.5" />
          <div>
            <span className="font-semibold text-cyan-200">Local Host CLI Binaries & Daemons</span>: Machine-level
            tools like Google Workspace via <code>gog</code> (Gmail, Calendar, Drive, Docs, Sheets), GitHub via <code>gh</code>,
            Beeper local chat bridge, and AI CLI agents.
          </div>
        </div>
      ) : null}

      {/* View: Specific Filter Selected */}
      {mechanismFilter !== "all" ? (
        <section className="mb-8">
          <SectionHead label={`${mechanismFilter.toUpperCase()} Tools`} count={filteredEntries.length} />
          <div className={GRID}>
            {filteredEntries.map((entry) => (
              <ConnectionCard
                key={entry.slug}
                entry={entry}
                connectStatus={connectStatus}
                onRecheck={handleRecheck}
              />
            ))}
          </div>
        </section>
      ) : (
        <>
          <section className="mb-8">
            <SectionHead label="Set up first" count={essentials.length} />
            <p className="mb-3 -mt-1 text-xs text-os-dim">
              Claude is the one Alacrán needs. Google and your chats are optional, and help it write your daily brief.
            </p>
            <div className={GRID}>
              {essentials.map((entry) => (
                <ConnectionCard
                  key={entry.slug}
                  entry={entry}
                  connectStatus={connectStatus}
                  onRecheck={handleRecheck}
                />
              ))}
            </div>
          </section>

          {yourTools.length > 0 && (
            <section className="mb-8">
              <SectionHead label="Your tools" count={yourTools.length} />
              <div className={GRID}>
                {yourTools.map((entry) => (
                  <ConnectionCard
                    key={entry.slug}
                    entry={entry}
                    connectStatus={connectStatus}
                    onRecheck={handleRecheck}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Popular Integrations Spotlight */}
          <section className="mb-8">
            <SectionHead label="Popular" count={popular.length} />
            <div className={GRID}>
              {popular.map((entry) => (
                <ConnectionCard
                  key={entry.slug}
                  entry={entry}
                  connectStatus={connectStatus}
                  onRecheck={handleRecheck}
                />
              ))}
            </div>
          </section>

          {/* Browse by category */}
          <section className="mb-8">
            <SectionHead label="All tools" count={categories.length} />
            <div className="flex flex-col gap-2.5">
              {categories.map(([category, tools], idx) => (
                <IntegrationCategory
                  key={category}
                  label={category}
                  count={tools.length}
                  defaultOpen={advanced && idx === 0}
                >
                  <div className={GRID}>
                    {tools.map((tool) => {
                      const liveEntry =
                        byId.get(tool.slug) ??
                        ({ ...tool, connected: false, keySaved: false } as CatalogEntry)
                      return (
                        <ConnectionCard
                          key={tool.slug}
                          entry={liveEntry}
                          connectStatus={connectStatus}
                          onRecheck={handleRecheck}
                        />
                      )
                    })}
                  </div>
                </IntegrationCategory>
              ))}
            </div>
          </section>
        </>
      )}

      {/* Direct .env.local API Keys Slot Manager — a raw file editor, Advanced only */}
      {advanced && <ApiKeys />}
    </div>
  )
}
