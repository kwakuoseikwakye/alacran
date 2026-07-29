"use client"

import { useState } from "react"
import { RefreshCw, ExternalLink } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BrandIcon, type BrandId } from "@/components/brand-icon"
import { CommandLine } from "@/components/copy-button"
import { getConnectStatus } from "@/lib/connect/connect-actions"
import type { ConnectStatus, ToolStatus } from "@/lib/connect/connect-status-impl"

// Each tool's real product mark. `gog` is a third-party CLI with no mark of its
// own, so Google's stands in for what it actually connects you to.
const TOOL_BRAND: Record<ToolStatus["id"], BrandId> = {
  claude: "claude",
  google: "google",
  github: "github",
}

// The Google services a connected `gog` unlocks — real marks, so the payoff of
// connecting is legible at a glance.
const GOOGLE_SURFACE: BrandId[] = ["gmail", "googlecalendar", "googledrive", "googlechat"]

function ToolCard({ tool, delay }: { tool: ToolStatus; delay: number }) {
  const live = tool.connected
  return (
    <Card
      className="a-rise gap-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-border/80"
      style={{ "--d": `${delay}ms` } as React.CSSProperties}
    >
      <CardHeader>
        {/* min-w-0: CardTitle is a grid item, whose automatic minimum size would
            otherwise stop the label ever truncating on narrow screens. */}
        <CardTitle className="flex min-w-0 items-start justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2.5">
            <span
              className={`grid size-9 shrink-0 place-items-center rounded-lg border transition-colors ${
                live ? "border-success/30 bg-success/10" : "border-border bg-background/60"
              }`}
            >
              <BrandIcon
                id={TOOL_BRAND[tool.id]}
                tone={live ? "brand" : "inherit"}
                className="size-[18px]"
              />
            </span>
            {/* wraps rather than truncates — there are only ever two tools and
                their names are long enough to clip even on a wide screen */}
            <span className="min-w-0 font-display leading-snug font-bold">{tool.label}</span>
          </span>
          <Badge
            variant="outline"
            className={
              live
                ? "border-success/30 bg-success/10 text-success"
                : "border-border text-muted-foreground"
            }
          >
            <span
              className={`mr-1 inline-block size-1.5 rounded-full ${
                live ? "a-live bg-success" : "bg-muted-foreground"
              }`}
            />
            {live ? "Connected" : "Not connected"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{tool.detail}</p>

        {tool.id === "google" && live && (
          <div className="flex items-center gap-2 pt-0.5">
            {GOOGLE_SURFACE.map((id) => (
              <span
                key={id}
                className="grid size-7 place-items-center rounded-md border border-border bg-background/60"
              >
                <BrandIcon id={id} tone="brand" className="size-3.5" />
              </span>
            ))}
            <span className="text-xs text-muted-foreground">available to your companies</span>
          </div>
        )}

        {!live && (
          <div className="space-y-3">
            {tool.guidance.steps.length > 0 && (
              <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                {tool.guidance.steps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            )}

            {tool.guidance.command && <CommandLine command={tool.guidance.command} />}

            {tool.guidance.link && (
              <a
                className="inline-flex items-center gap-1 text-xs text-primary underline-offset-4 hover:underline"
                href={tool.guidance.link}
                target="_blank"
                rel="noreferrer"
              >
                Instructions <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function ConnectPanel({ initialStatus }: { initialStatus: ConnectStatus }) {
  const [status, setStatus] = useState<ConnectStatus>(initialStatus)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(false)

  async function recheck() {
    setPending(true)
    setError(false)
    try {
      setStatus(await getConnectStatus())
    } catch {
      setError(true)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-muted-foreground">
          These tools live on your machine. Connect them once and every company can use them.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={recheck} disabled={pending}>
          <RefreshCw className={`h-3.5 w-3.5 ${pending ? "animate-spin" : ""}`} />
          {pending ? "Checking…" : "Re-check"}
        </Button>
      </div>

      {error && (
        <p className="text-xs text-destructive">Couldn&apos;t check connection status — press Re-check to retry.</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <ToolCard tool={status.claude} delay={0} />
        <ToolCard tool={status.google} delay={90} />
        <ToolCard tool={status.github} delay={180} />
      </div>
    </div>
  )
}
