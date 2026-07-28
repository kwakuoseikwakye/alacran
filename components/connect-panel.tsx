"use client"

import { useState } from "react"
import { Check, Copy, RefreshCw, ExternalLink } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { getConnectStatus } from "@/lib/connect/connect-actions"
import type { ConnectStatus, ToolStatus } from "@/lib/connect/connect-status-impl"

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="h-7 shrink-0 px-2"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch {
          // clipboard unavailable — user can still select the text
        }
      }}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : "Copy"}
    </Button>
  )
}

function ToolCard({ tool }: { tool: ToolStatus }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3">
          <span>{tool.label}</span>
          <Badge variant={tool.connected ? "default" : "outline"}>
            {tool.connected ? "Connected" : "Not connected"}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{tool.detail}</p>

        {!tool.connected && (
          <div className="space-y-3">
            {tool.guidance.steps.length > 0 && (
              <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                {tool.guidance.steps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            )}

            {tool.guidance.command && (
              <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
                <code className="min-w-0 flex-1 overflow-x-auto whitespace-pre text-xs">
                  {tool.guidance.command}
                </code>
                <CopyButton text={tool.guidance.command} />
              </div>
            )}

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
      <div className="flex items-center justify-between gap-4">
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
        <ToolCard tool={status.claude} />
        <ToolCard tool={status.google} />
      </div>
    </div>
  )
}
