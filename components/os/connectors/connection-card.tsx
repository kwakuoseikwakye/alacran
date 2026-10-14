"use client"

import React, { useState } from "react"
import { BrandLogo } from "@/lib/os/connectors/brand-logos"
import { connectKeysFor, type CatalogEntry } from "@/lib/os/connectors/integrations-catalog"
import { ConnectFlow } from "./connect-flow"
import { MachineSetupModal } from "./machine-setup-modal"
import { McpSetupModal } from "./mcp-setup-modal"
import type { ConnectStatus } from "@/lib/connect/connect-status-impl"

const MACHINE_SLUGS = new Set([
  "claude-code",
  "google",
  "outlook",
  "github",
  "beeper",
  "notion",
  "kiro",
  "kimi",
  "antigravity",
])

export function ConnectionCard({
  entry,
  guidance,
  connectStatus,
  onRecheck,
}: {
  entry: CatalogEntry
  guidance?: string
  connectStatus?: ConnectStatus
  onRecheck?: () => Promise<void>
}) {
  const [modalOpen, setModalOpen] = useState(false)
  const [mcpModalOpen, setMcpModalOpen] = useState(false)

  if (!entry) return null

  const isMachineTool = MACHINE_SLUGS.has(entry.slug)
  const isMcpTool = entry.mechanism === "mcp"

  return (
    <div className="group flex min-h-[116px] flex-col justify-between rounded-2xl border border-os-border bg-os-surface p-4 transition-colors hover:border-os-border-strong">
      <div className="flex items-start gap-3">
        <BrandLogo slug={entry.slug} name={entry.name} />
        <div className="min-w-0 flex-1 pt-0.5">
          <div className="flex items-center justify-between gap-1.5">
            <span className="truncate text-[13.5px] font-semibold leading-tight text-os-text">
              {entry.name}
            </span>
            {entry.mechanism === "mcp" ? (
              <span className="shrink-0 rounded-full border border-purple-500/30 bg-purple-500/10 px-1.5 py-0.2 font-mono text-[9px] uppercase tracking-wider text-purple-400">
                MCP
              </span>
            ) : entry.mechanism === "cli" ? (
              <span className="shrink-0 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-1.5 py-0.2 font-mono text-[9px] uppercase tracking-wider text-cyan-400">
                CLI
              </span>
            ) : (
              <span className="shrink-0 rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.2 font-mono text-[9px] uppercase tracking-wider text-amber-400">
                API Key
              </span>
            )}
          </div>
          <div className="mt-1 truncate text-[11px] leading-tight text-os-dim">
            {entry.tagline}
          </div>
        </div>
      </div>

      {isMcpTool ? (
        <div className="mt-3 flex items-center justify-between">
          {entry.connected ? (
            <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-os-ok">
              <span className="h-1.5 w-1.5 rounded-full bg-os-ok animate-pulse" />
              In your tool pool
            </span>
          ) : (
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-os-dim">
              Not in your pool
            </span>
          )}

          <button
            type="button"
            onClick={() => setMcpModalOpen(true)}
            className="rounded-full border border-os-border px-3 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-os-dim transition-colors hover:border-os-border-strong hover:text-os-text cursor-pointer"
          >
            View
          </button>

          <McpSetupModal open={mcpModalOpen} onClose={() => setMcpModalOpen(false)} entry={entry} />
        </div>
      ) : isMachineTool ? (
        <div className="mt-3 flex items-center justify-between">
          {entry.connected ? (
            <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-os-ok">
              <span className="h-1.5 w-1.5 rounded-full bg-os-ok" />
              Connected
            </span>
          ) : entry.keySaved ? (
            <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-os-warn">
              <span className="h-1.5 w-1.5 rounded-full bg-os-warn" />
              Key saved
            </span>
          ) : (
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-os-dim">
              Not connected
            </span>
          )}

          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className={`rounded-full px-3 py-1 font-mono text-[10px] uppercase tracking-[0.1em] transition-colors cursor-pointer ${
              entry.connected
                ? "border border-os-border text-os-dim hover:border-os-border-strong hover:text-os-text"
                : "border border-os-border-strong text-os-text hover:bg-os-text hover:text-os-bg"
            }`}
          >
            {entry.connected ? "Manage" : "+ Connect"}
          </button>

          <MachineSetupModal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            slug={entry.slug}
            name={entry.name}
            connectStatus={connectStatus}
            onRecheck={onRecheck}
          />
        </div>
      ) : (
        <ConnectFlow
          slug={entry.slug}
          connected={entry.connected}
          keySaved={entry.keySaved}
          keys={connectKeysFor(entry)}
          guidance={guidance}
        />
      )}
    </div>
  )
}
