"use client"

import React, { useState } from "react"
import { ArrowUpRight, Copy, Check } from "lucide-react"
import { Badge } from "@/components/os/terminal"
import type { LeadMagnetItem } from "@/lib/os/departments/adapters/content-adapter"

function useSafeState<T>(initial: T | (() => T)): [T, React.Dispatch<React.SetStateAction<T>>] {
  try {
    return useState<T>(initial)
  } catch {
    const val = typeof initial === "function" ? (initial as () => T)() : initial
    return [val, () => {}]
  }
}

export function LeadMagnetsTable({
  rows,
  showCopy = true,
}: {
  rows: LeadMagnetItem[]
  showCopy?: boolean
  manage?: boolean
}) {
  const [copiedId, setCopiedId] = useSafeState<string | null>(null)

  const handleCopy = async (id: string, url: string) => {
    try {
      await navigator.clipboard.writeText(url)
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 1500)
    } catch {
      // clipboard write failed silently
    }
  }

  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-os-border bg-os-surface px-4 py-5 text-center font-mono text-[11.5px] text-os-dim">
        No lead magnets recorded yet. Every landing page or guide shipped lands here.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-os-border bg-os-surface">
      <table className="w-full border-collapse text-left font-mono text-[11px]">
        <thead>
          <tr className="border-b border-os-border text-[9.5px] uppercase tracking-wider text-os-dim">
            <th className="px-4 py-2.5">Asset / Offer</th>
            <th className="px-4 py-2.5">Subscribers / Leads</th>
            <th className="px-4 py-2.5">Status</th>
            <th className="px-4 py-2.5">URL &amp; Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-os-border/50">
          {rows.map((m) => (
            <tr key={m.id} className="text-os-text hover:bg-os-surface2/50 transition-colors">
              <td className="px-4 py-2.5 font-sans font-medium text-[13px]">{m.title}</td>
              <td className="px-4 py-2.5 font-mono text-os-muted">
                {m.subscribers} converted
              </td>
              <td className="px-4 py-2.5">
                <Badge tone={m.status === "live" ? "ok" : "warn"}>{m.status}</Badge>
              </td>
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <a
                    href={m.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-os-accent hover:underline"
                  >
                    <span>open</span>
                    <ArrowUpRight className="h-3 w-3" />
                  </a>
                  {showCopy && (
                    <button
                      type="button"
                      onClick={() => handleCopy(m.id, m.url)}
                      className="inline-flex items-center gap-1 rounded border border-os-border bg-os-surface2 px-1.5 py-0.5 font-mono text-[10px] text-os-dim hover:text-os-text hover:border-os-border-strong transition-colors"
                      title="Copy link to clipboard"
                    >
                      {copiedId === m.id ? (
                        <>
                          <Check className="h-2.5 w-2.5 text-os-ok" />
                          <span className="text-os-ok">copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-2.5 w-2.5" />
                          <span>copy link</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
