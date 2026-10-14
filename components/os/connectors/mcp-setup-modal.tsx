"use client"

import React from "react"
import { X, ExternalLink, Shield, Terminal, Sparkles } from "lucide-react"
import { BrandLogo } from "@/lib/os/connectors/brand-logos"
import { Button } from "@/components/ui/button"
import type { CatalogEntry } from "@/lib/os/connectors/integrations-catalog"

/**
 * Read-only detail for one MCP server. This page is nav-labelled
 * `scope: "system"` — it owns the machine's POOL of known servers, not any
 * one company's `.mcp.json`. `entry.connected` already means "in the pool"
 * (lib/os/connectors/integrations-catalog.ts), so there is nothing left to
 * toggle here.
 *
 * This modal used to write straight to one company's `.mcp.json`, scoped by
 * an `activeCompanyId` read off a cookie — on a page that claims to be
 * machine-wide. That mismatch is the bug the per-company-connections feature
 * exists to fix: picking a tool for a specific company now happens in that
 * company's own Company Info & Settings ("What this company uses"), where
 * the company is explicit rather than whatever the topbar happened to have
 * selected.
 */
export function McpSetupModal({
  open,
  onClose,
  entry,
}: {
  open: boolean
  onClose: () => void
  entry: CatalogEntry
}) {
  if (!open) return null

  const targetUrl = entry.mcpUrl

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs select-none">
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-os-border bg-os-bg p-6 text-os-text shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-start justify-between border-b border-os-border pb-4">
          <div className="flex items-center gap-3">
            <BrandLogo slug={entry.slug} name={entry.name} size={42} />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-os-text">{entry.name}</h2>
                <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-purple-400">
                  MCP Server
                </span>
              </div>
              <p className="font-mono text-xs text-os-dim">{entry.tagline}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded-lg p-1 text-os-dim hover:bg-os-surface2 hover:text-os-text cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body Content */}
        <div className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto">
          <div className="rounded-lg border border-os-border bg-os-surface p-3.5 space-y-2">
            <div className="flex items-center gap-2 font-mono text-xs text-os-accent">
              <Sparkles className="h-3.5 w-3.5" />
              <span>Model Context Protocol Integration</span>
            </div>
            <p className="text-xs text-os-muted leading-relaxed">
              This integration connects via <strong>Model Context Protocol (MCP)</strong>. Rather than a stored API
              key, the tool endpoint lives in this machine&apos;s tool pool — every company picks from the same
              list, in its own Company Info &amp; Settings.
            </p>
          </div>

          {targetUrl && (
            <div className="space-y-1.5 font-mono text-xs">
              <div className="text-[11px] text-os-dim uppercase tracking-wider">MCP Server Endpoint</div>
              <div className="flex items-center justify-between rounded-md border border-os-border bg-os-surface2 px-3 py-2 text-os-text">
                <code className="truncate">{targetUrl}</code>
                <a
                  href={targetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-2 text-os-dim hover:text-os-accent"
                  title="View endpoint"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </div>
            </div>
          )}

          {/* Status */}
          <div className="rounded-lg border border-os-border bg-os-surface p-4">
            <div className="font-mono text-xs font-semibold text-os-text">Machine status</div>
            <div className="mt-1 flex items-center gap-1.5 font-mono text-[11px]">
              {entry.connected ? (
                <>
                  <span className="size-1.5 rounded-full bg-os-ok animate-pulse" />
                  <span className="text-os-ok">In your tool pool</span>
                </>
              ) : (
                <>
                  <span className="size-1.5 rounded-full bg-os-dim" />
                  <span className="text-os-dim">Not in your tool pool yet</span>
                </>
              )}
            </div>
          </div>

          {/* Setup Guidance */}
          <div className="space-y-2 rounded-lg border border-os-border bg-os-surface p-3.5 text-xs text-os-muted">
            <div className="flex items-center gap-2 font-mono font-semibold text-os-text">
              <Terminal className="h-3.5 w-3.5" />
              <span>Turning it on for a company</span>
            </div>
            <ol className="list-decimal space-y-1.5 pl-4 text-[11.5px] leading-relaxed">
              <li>
                Open that company&apos;s <strong>Company Info &amp; Settings</strong> and tick {entry.name} under
                &quot;What this company uses&quot;.
              </li>
              <li>
                Open <strong>Terminal</strong> in that company&apos;s workspace and launch its AI agent (e.g.{" "}
                <code>claude</code> or <code>kiro</code>).
              </li>
              <li>
                Approve the MCP tool upon initial launch, then type <code className="text-os-accent">/mcp</code> in
                the agent session to authenticate with your browser.
              </li>
            </ol>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-5 flex shrink-0 items-center justify-between border-t border-os-border pt-4">
          <div className="flex items-center gap-1.5 font-mono text-[10px] text-os-dim">
            <Shield className="h-3 w-3" />
            <span>Agent Sandboxed · Zero Secret Leaks</span>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            className="border-os-border bg-os-surface text-xs text-os-text hover:bg-os-surface2 cursor-pointer"
          >
            Done
          </Button>
        </div>
      </div>
    </div>
  )
}
