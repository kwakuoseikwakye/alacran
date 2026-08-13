"use client"

import { useState } from "react"
import { RefreshCw, ExternalLink, Bot, Download, Loader2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BrandIcon, type BrandId } from "@/components/brand-icon"
import { CommandLine } from "@/components/copy-button"
import { ConnectHelp } from "@/components/connect-help"
import { recheckConnectStatus } from "@/lib/connect/connect-actions"
import { installTool } from "@/lib/install-tool"
import { signInClaude } from "@/lib/sign-in-claude"
// Type-only, and it must stay that way: install-tool-impl imports
// node:child_process, so a value import would drag it into the client bundle
// and fail the build (v61 hit exactly this with McpServer).
import type { InstallableId } from "@/lib/install-tool-impl"
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
// connecting is legible at a glance. Kept in step with GOOGLE_SERVICES below —
// showing a Drive or Chat mark for a scope we never ask Google for is a promise
// the connection doesn't keep.
const GOOGLE_SURFACE: BrandId[] = ["gmail", "googlecalendar"]

/**
 * The scopes every `gog` command in this app actually uses: `check-inbox` and
 * `triage-email` call Gmail, and Calendar is what this card has always been
 * named for. gog's own default is six services (adding drive, docs, sheets,
 * contacts), each of which is another API the user must click Enable on in the
 * Cloud console — so asking for only what's used is three fewer manual steps,
 * not just a tighter grant. More can be added later by re-running `auth add`
 * with a longer list.
 */
const GOOGLE_SERVICES = "gmail,calendar"

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
      {email.trim() && (
        <CommandLine command={`gog auth add ${email.trim()} --services ${GOOGLE_SERVICES}`} />
      )}
    </div>
  )
}

/** Each link opens the exact console page for that step, pre-filled where
 *  Google allows it, so "go to the Cloud console and find X" is never an
 *  instruction. Enabling an API has a direct per-API URL; creating the OAuth
 *  client does not, hence the click path spelled out in `then`. */
const GOOGLE_CONSOLE_STEPS: { title: string; href: string; then: string }[] = [
  {
    title: "Create a project",
    href: "https://console.cloud.google.com/projectcreate",
    then: "Give it any name — “My AI” is fine — and click Create. Wait for it to finish before the next step.",
  },
  {
    title: "Turn on Gmail",
    href: "https://console.cloud.google.com/apis/library/gmail.googleapis.com",
    then: "Click the blue Enable button. That is the whole step.",
  },
  {
    title: "Turn on Calendar",
    href: "https://console.cloud.google.com/apis/library/calendar-json.googleapis.com",
    then: "Click Enable here too.",
  },
  {
    title: "Say who can use it",
    href: "https://console.cloud.google.com/auth/overview",
    then: "Pick External, put your own email in the boxes it asks for, and save. This is just Google asking who owns the app — it stays private to you.",
  },
  {
    title: "Create the key and download it",
    href: "https://console.cloud.google.com/auth/clients",
    then: "Click Create client, choose Desktop app as the type, click Create, then Download JSON. It lands in your Downloads folder.",
  },
  {
    title: "Publish it (don't skip)",
    href: "https://console.cloud.google.com/auth/audience",
    then: "Click Publish app, then Confirm. Skip this and Google cuts the connection after 7 days. It does not submit anything for review.",
  },
]

function ConsoleLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      className="inline-flex items-center gap-1 text-primary underline-offset-4 hover:underline"
      href={href}
      target="_blank"
      rel="noreferrer"
    >
      {children} <ExternalLink className="h-3 w-3" />
    </a>
  )
}

/**
 * Replaces the old single `gog auth setup` button, which was the bug the user
 * hit: that command only PRINTS a plan, so following the card's "complete the
 * Google sign-in" connected nothing and left no visible next step.
 *
 * Google's own rules set the shape here and no amount of UI removes it — an
 * OAuth client can only be created by a human in the Cloud console (there is
 * no API for it), so the honest best version is to link every console page
 * directly, say what to click on each, and then hand over a single command
 * that stores the download AND runs the browser sign-in in one go.
 */
function GoogleSetup({ stage }: { stage: "client" | "account" }) {
  const [email, setEmail] = useState("")
  const address = email.trim()

  const emailField = (
    <Input
      type="email"
      placeholder="you@example.com"
      value={email}
      onChange={(e) => setEmail(e.target.value)}
      className="h-8 text-xs"
    />
  )

  if (stage === "account") {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          The one-time Google setup is already done on this machine. Only one step left: say which address to
          connect, then run this. A browser window opens — approve it, come back, press Re-check.
        </p>
        {emailField}
        {address && <CommandLine command={`gog auth add ${address} --services ${GOOGLE_SERVICES}`} />}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Google makes every person create their own free key before a tool can read their mail. It is a one-time
        setup, about five minutes, all in your browser. Nothing here costs money and you never need to understand
        Google Cloud — just click what each step says.
      </p>
      <ol className="list-decimal space-y-2 pl-5 text-xs text-muted-foreground">
        {GOOGLE_CONSOLE_STEPS.map((step) => (
          <li key={step.title}>
            <ConsoleLink href={step.href}>{step.title}</ConsoleLink>
            <span className="block">{step.then}</span>
          </li>
        ))}
      </ol>
      <div className="space-y-1.5 border-t border-border pt-3">
        <p className="text-xs text-muted-foreground">
          <strong>Last step.</strong> Type the Google address you just set this up for, then run the command. It
          picks up the downloaded file and opens the sign-in for you. Approve it, come back, press Re-check.
        </p>
        {emailField}
        {address && (
          <CommandLine
            command={`gog auth setup ${address} --credentials ~/Downloads/client_secret_*.json --login --services ${GOOGLE_SERVICES}`}
          />
        )}
      </div>
    </div>
  )
}

/**
 * Answers a real user question: "a popup says gog wants to use your confidential
 * information stored in 'gogcli' in your keychain, and it keeps coming back."
 *
 * It is not a sign anything is broken, and it is not something this app can fix.
 * Homebrew ships `gog` ad-hoc/linker-signed, so its code hash changes on every
 * release, and a macOS Keychain ACL binds to the writing process's Designated
 * Requirement — so "Always Allow" stops sticking as soon as gog updates
 * (openclaw/gogcli#569). All this app can do is stop asking gog on every page
 * render, which lib/exec-memo.ts now does, and say what the prompt is.
 */
function KeychainNote() {
  return (
    <details className="rounded-lg border border-border bg-background/40 p-2.5">
      <summary className="cursor-pointer text-xs text-muted-foreground">
        Seeing a &ldquo;gog wants to use your confidential information&rdquo; popup?
      </summary>
      <div className="space-y-2 pt-2">
        <p className="text-xs text-muted-foreground">
          That&apos;s macOS asking whether the Google CLI may read the sign-in it saved in your Keychain. It is
          expected, and nothing is wrong. Click <strong>Always Allow</strong> rather than Allow. It can come back
          after the Google CLI updates &mdash; that&apos;s a known issue in the CLI itself, not something this app
          controls.
        </p>
        <p className="text-xs text-muted-foreground">
          If it keeps asking and you&apos;d rather never see it, you can move the sign-in out of the Keychain into
          a password-protected file instead:
        </p>
        <CommandLine command="gog auth keyring file" />
      </div>
    </details>
  )
}

/**
 * Installs one tool, in place, with no terminal. The whole point of the
 * non-technical path: a user who doesn't know what a PATH is should never be
 * asked to paste `brew install` into anything.
 *
 * ponytail: no streaming — the log appears when the command finishes, not as
 * it runs. A cold Homebrew install can sit on this spinner for a minute. Add
 * a tailed log (the run-log pattern in lib/company-commands/) if that silence
 * actually generates confusion; a spinner plus "this can take a minute" is
 * the cheaper thing to try first.
 */
function InstallButton({ id, onDone }: { id: InstallableId; onDone: () => void }) {
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState<string | null>(null)
  const [needsAgent, setNeedsAgent] = useState(false)

  async function run() {
    setBusy(true)
    setLog(null)
    setNeedsAgent(false)
    try {
      const result = await installTool(id)
      if (result.ok) {
        onDone()
        return
      }
      setNeedsAgent(Boolean(result.needsAgent))
      setLog(result.log.trim() || null)
    } catch {
      setNeedsAgent(true)
      setLog(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <Button size="sm" onClick={run} disabled={busy}>
        {busy ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Download className="mr-1.5 size-3.5" />}
        {busy ? "Installing… this can take a minute" : "Install it for me"}
      </Button>
      {needsAgent && (
        <p className="text-xs text-muted-foreground">
          That didn&apos;t work automatically. The steps below still do it by hand.
        </p>
      )}
      {log && (
        <pre className="max-h-40 overflow-auto rounded-md border border-border bg-background/60 p-2 text-[11px] text-muted-foreground">
          {log}
        </pre>
      )}
    </div>
  )
}

/** Claude Code is installed but nobody is signed in. One button, one browser
 *  trip. The email only pre-populates the login page (`--email`), so a typo
 *  costs nothing — but getting it right is what makes Google line up on the
 *  same account later. */
function SignInButton({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function run() {
    setBusy(true)
    try {
      const result = await signInClaude(email)
      setMessage(result.message)
      if (result.started) onDone()
    } catch {
      setMessage("Couldn't open a terminal to sign in.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <Input
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com (optional)"
        aria-label="Email to sign in with"
      />
      <Button size="sm" onClick={run} disabled={busy}>
        {busy ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
        Sign in
      </Button>
      {message && <p className="text-xs text-muted-foreground">{message}</p>}
    </div>
  )
}

function ToolCard({ tool, delay, onChanged }: { tool: ToolStatus; delay: number; onChanged: () => void }) {
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
            <KeychainNote />
          </>
        )}

        {!live && (
          <div className="space-y-3">
            {/* Buttons before instructions: the whole point is that a
                non-technical user never has to reach the instructions. */}
            {tool.installId && <InstallButton id={tool.installId} onDone={onChanged} />}
            {tool.needsSignIn && <SignInButton onDone={onChanged} />}
            {/* Google is the one tool whose setup isn't "run this one command":
                Google requires a per-person OAuth client that only a human can
                create in their console. Rendered before the generic block,
                which for these two stages carries no command of its own. */}
            {tool.id === "google" && (tool.googleStage === "client" || tool.googleStage === "account") && (
              <>
                <GoogleSetup stage={tool.googleStage} />
                <KeychainNote />
              </>
            )}

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
      setStatus(await recheckConnectStatus())
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
          <ToolCard key={tool.id} tool={tool} delay={i * 90} onChanged={recheck} />
        ))}
        <ToolCard tool={status.google} delay={status.aiExecutors.length * 90} onChanged={recheck} />
        <ToolCard tool={status.github} delay={(status.aiExecutors.length + 1) * 90} onChanged={recheck} />
        <NotionCard notion={status.notion} delay={(status.aiExecutors.length + 2) * 90} />
      </div>
    </div>
  )
}
