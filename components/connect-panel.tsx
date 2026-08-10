"use client"

import { useState } from "react"
import { RefreshCw, ExternalLink, Bot } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BrandIcon, type BrandId } from "@/components/brand-icon"
import { CommandLine } from "@/components/copy-button"
import { ConnectHelp } from "@/components/connect-help"
import { getConnectStatus } from "@/lib/connect/connect-actions"
import type { ConnectStatus, ToolStatus, NotionStatus } from "@/lib/connect/connect-status-impl"

// Each tool's real product mark, where one exists. `gog` has no mark of its
// own, so Google's stands in for what it actually connects you to.
// OpenAI's mark was withdrawn from the Simple Icons dataset and Aider (a
// smaller open-source project) was never in it — both fall back to a generic
// icon in ToolCard rather than an approximated/redrawn logo.
export const TOOL_BRAND: Partial<Record<ToolStatus["id"], BrandId>> = {
  "claude-code": "claude",
  "google-antigravity": "google-antigravity",
  google: "google",
  github: "github",
}

// The Google services a connected `gog` unlocks. These are real marks, so the payoff of
// connecting is legible at a glance.
const GOOGLE_SURFACE: BrandId[] = ["gmail", "googlecalendar", "googledrive", "googlechat"]

/** Lets you connect a 2nd, 3rd, ... Google account. Same pattern as every
 *  other guidance flow here: show the exact command, the user runs it in
 *  their own terminal, then presses Re-check — the app never spawns an
 *  interactive OAuth flow itself. */
function AddGoogleAccount() {
  const [email, setEmail] = useState("")
  return (
    <div className="space-y-1.5 border-t border-border pt-3">
      <p className="text-xs text-muted-foreground">Connect another email</p>
      <div className="flex gap-2">
        <Input
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-8 text-xs"
        />
      </div>
      {email.trim() && <CommandLine command={`gog auth add ${email.trim()}`} />}
    </div>
  )
}

function ToolCard({ tool, delay }: { tool: ToolStatus; delay: number }) {
  const live = tool.connected
  const brand = TOOL_BRAND[tool.id]
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
              {brand ? (
                <BrandIcon id={brand} tone={live ? "brand" : "inherit"} className="size-[18px]" />
              ) : (
                <Bot className="size-[18px]" aria-label={tool.label} />
              )}
            </span>
            {/* wraps rather than truncates: names get long enough (e.g. Aider's)
                to clip even on a wide screen */}
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

        {tool.id !== "google" && tool.id !== "github" && (
          <p className="text-xs text-muted-foreground">
            Assign which company runs commands with this from that company&apos;s card.
          </p>
        )}

        {tool.id === "google" && live && (
          <>
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
            {tool.accounts && tool.accounts.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {tool.accounts.map((email) => (
                  <Badge key={email} variant="outline" className="border-border font-normal text-muted-foreground">
                    {email}
                  </Badge>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Assign specific accounts to a company from that company&apos;s card.
            </p>
            <AddGoogleAccount />
          </>
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

/** Notion has no single machine-wide connected state — the api-connect skill
 *  writes NOTION_TOKEN into each company's own .env, so "connected" is a
 *  different answer per company. Shaped differently from ToolCard on purpose
 *  rather than forced into it: a summary badge instead of one Connected/Not
 *  pill, and a per-company list instead of a single detail line. */
function NotionCard({ notion, delay }: { notion: NotionStatus; delay: number }) {
  const total = notion.companies.length
  const connectedCount = notion.companies.filter((c) => c.connected).length
  const anyConnected = connectedCount > 0
  return (
    <Card
      className="a-rise gap-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-border/80"
      style={{ "--d": `${delay}ms` } as React.CSSProperties}
    >
      <CardHeader>
        <CardTitle className="flex min-w-0 items-start justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2.5">
            <span
              className={`grid size-9 shrink-0 place-items-center rounded-lg border transition-colors ${
                anyConnected ? "border-success/30 bg-success/10" : "border-border bg-background/60"
              }`}
            >
              <BrandIcon id="notion" tone={anyConnected ? "brand" : "inherit"} className="size-[18px]" />
            </span>
            <span className="min-w-0 font-display leading-snug font-bold">Notion</span>
          </span>
          <Badge
            variant="outline"
            className={
              anyConnected
                ? "border-success/30 bg-success/10 text-success"
                : "border-border text-muted-foreground"
            }
          >
            <span
              className={`mr-1 inline-block size-1.5 rounded-full ${
                anyConnected ? "a-live bg-success" : "bg-muted-foreground"
              }`}
            />
            {total === 0 ? "No companies yet" : `${connectedCount} of ${total} connected`}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Not one machine-wide sign-in like the others — each company connects its own, via the{" "}
          <code>api-connect</code> skill inside that company&apos;s own repo.
        </p>

        {total === 0 ? (
          <p className="text-xs text-muted-foreground">
            Register or create a company first, then connect Notion for it.
          </p>
        ) : (
          <div className="space-y-1.5">
            {notion.companies.map((c) => (
              <div
                key={c.agentId}
                className="flex items-center justify-between gap-2 rounded-md border border-border bg-background/60 px-3 py-1.5 text-xs"
              >
                <span className="min-w-0 truncate">{c.companyName}</span>
                <span
                  className={`inline-flex shrink-0 items-center gap-1 ${
                    c.connected ? "text-success" : "text-muted-foreground"
                  }`}
                >
                  <span className={`size-1.5 rounded-full ${c.connected ? "bg-success" : "bg-muted-foreground"}`} />
                  {c.connected ? "Connected" : "Not connected"}
                </span>
              </div>
            ))}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          To connect one: open its Skills page and run the api-connect skill (&ldquo;connect Notion&rdquo;), or use
          &ldquo;Open in Terminal&rdquo; on its card and ask your AI assistant to connect Notion.
        </p>
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

  const anyNotConnected =
    status.aiExecutors.some((t) => !t.connected) || !status.google.connected || !status.github.connected

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1">
          <p className="text-sm text-muted-foreground">
            These tools live on your machine. Connect them once and every company can use them.
          </p>
          <ConnectHelp anyNotConnected={anyNotConnected} />
        </div>
        <Button type="button" variant="outline" size="sm" onClick={recheck} disabled={pending}>
          <RefreshCw className={`h-3.5 w-3.5 ${pending ? "animate-spin" : ""}`} />
          {pending ? "Checking…" : "Re-check"}
        </Button>
      </div>

      {error && (
        <p className="text-xs text-destructive">We couldn&apos;t check connection status. Please press Re-check to retry.</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {status.aiExecutors.map((tool, i) => (
          <ToolCard key={tool.id} tool={tool} delay={i * 90} />
        ))}
        <ToolCard tool={status.google} delay={status.aiExecutors.length * 90} />
        <ToolCard tool={status.github} delay={(status.aiExecutors.length + 1) * 90} />
        <NotionCard notion={status.notion} delay={(status.aiExecutors.length + 2) * 90} />
      </div>
    </div>
  )
}
