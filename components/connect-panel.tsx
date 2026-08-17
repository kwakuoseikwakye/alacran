"use client"

import { useState } from "react"
import { RefreshCw, ExternalLink, Bot, Download, Loader2, Wand2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { BrandIcon, type BrandId } from "@/components/brand-icon"
import { CommandLine } from "@/components/copy-button"
import { ConnectHelp } from "@/components/connect-help"
import { useAdvancedMode } from "@/components/advanced-only"
import { GOOGLE_SERVICES, DEFAULT_GOOGLE_SERVICE_IDS, serviceListArg } from "@/lib/google-services"
import { GOOGLE_CONSOLE_STEPS } from "@/lib/google-console-steps"
import { recheckConnectStatus } from "@/lib/connect/connect-actions"
import { installTool } from "@/lib/install-tool"
import { installRepair } from "@/lib/install-repair"
import { openChromeAccountCheck, setupGoogle } from "@/lib/setup-google"
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

/**
 * Which Google services a user wants authorized, as a checkbox list.
 *
 * Replaces two hardcoded `"gmail,calendar"` constants and a hardcoded array of
 * marks. The catalog in lib/google-services.ts is now the only place a service
 * is declared; this picker, the command it builds, and the console pages the
 * browser agent enables all read from it.
 *
 * Defaults stay Gmail + Calendar for the reason v64 narrowed them: each extra
 * service is one more API the user has to click Enable on before consent will
 * succeed. Extra reach is opt-in, not the price of connecting at all.
 */
function ServicePicker({
  selected,
  onChange,
  granted,
}: {
  selected: string[]
  onChange: (ids: string[]) => void
  granted?: string[]
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {GOOGLE_SERVICES.map((service) => {
        const on = selected.includes(service.id)
        const already = granted?.includes(service.id)
        return (
          <label
            key={service.id}
            className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-colors ${
              on ? "border-primary/40 bg-primary/10 text-foreground" : "border-border text-muted-foreground"
            }`}
          >
            {/* An already-granted service can't be unticked: nothing here can
                revoke a scope, and re-authorizing with a narrower list is how
                you'd silently drop Gmail from an account that had it. */}
            <input
              type="checkbox"
              checked={on}
              disabled={already}
              onChange={(e) => onChange(e.target.checked ? [...selected, service.id] : selected.filter((id) => id !== service.id))}
              className="size-3"
            />
            {service.label}
            {already && <span className="text-success" title="Already authorized">✓</span>}
          </label>
        )
      })}
    </div>
  )
}

/**
 * Turn on more Google apps — on an account that's already connected, or on a
 * new address. It's one control because `gog auth add <email> --services …`
 * is literally the same command for both: on a stored account it re-authorizes
 * with the wider list, on a new one it's the first authorization.
 *
 * This is the door that was missing. Anyone who connected before the service
 * picker existed has gmail+calendar and, until now, no way to reach Drive,
 * Docs or Sheets short of redoing a setup they'd already done — the card
 * showed the two marks and offered nothing but "connect another email."
 */
/** Case-insensitive lookup. The server matches the stored address with
 *  `.toLowerCase()` (setup-google-impl), so a case-different rendering of the
 *  same address must not read as a different, unknown account here — that
 *  mismatch would show first-time copy while the server ran the expand job,
 *  and would build the manual command narrower than the account's real scopes. */
function grantsFor(
  accountServices: Record<string, string[]> | undefined,
  address: string
): string[] | undefined {
  if (!accountServices) return undefined
  const key = Object.keys(accountServices).find((k) => k.toLowerCase() === address.toLowerCase())
  return key === undefined ? undefined : accountServices[key]
}

function ConnectGoogleApps({
  accounts,
  accountServices,
  claudeReady,
}: {
  accounts: string[]
  /** Per account, NOT the union: what one address already carries is the only
   *  honest answer for a picker that authorizes one address. */
  accountServices?: Record<string, string[]>
  claudeReady: boolean
}) {
  const [email, setEmail] = useState(accounts[0] ?? "")
  // `?? DEFAULT` and not `|| DEFAULT`: a stored account whose scopes map to no
  // catalog service is a real, empty [], and starting the picker at the
  // defaults there would silently re-tick Gmail and Calendar for someone who
  // has neither.
  const [services, setServices] = useState<string[]>(
    grantsFor(accountServices, accounts[0] ?? "") ?? DEFAULT_GOOGLE_SERVICE_IDS
  )
  const address = email.trim()
  // Only an address that's actually stored gets the "already granted" marks
  // and the shorter agent job — typing a brand-new address here is a
  // first-time connection for that account, even though the machine's OAuth
  // client is set up.
  const stored = accounts.some((a) => a.toLowerCase() === address.toLowerCase())
  const accountGranted = grantsFor(accountServices, address)
  // Stored, but we could not read its scopes — the `gog auth status` fallback
  // in connect-status-impl reports connected without them. Anything we build
  // here would either narrow the token or run the first-time console setup on
  // a machine that already has an OAuth client, so build nothing.
  const grantsUnknown = stored && accountGranted === undefined
  // Never narrower than what's already there: gog stores what --services asks
  // for, so dropping one from the list drops the scope.
  const requested = serviceListArg([...(accountGranted ?? []), ...services])
  // Compared as id sets, NOT as serviceListArg strings: that helper substitutes
  // the defaults for an empty list, so two different empty inputs both render
  // "gmail,calendar" and an account with nothing on would read as fully set up.
  const nothingNew = services.every((s) => (accountGranted ?? []).includes(s))

  return (
    <div className="space-y-2 border-t border-border pt-3">
      <p className="text-xs font-medium">Turn on more Google apps</p>
      {accounts.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {accounts.map((a) => (
            <button
              key={a}
              type="button"
              onClick={() => {
                setEmail(a)
                // Otherwise a selection made for the previous account carries
                // over and reads as "already on" for one that never had it.
                setServices(grantsFor(accountServices, a) ?? DEFAULT_GOOGLE_SERVICE_IDS)
              }}
              className={`rounded-md border px-2 py-1 text-[11px] transition-colors ${
                a.toLowerCase() === address.toLowerCase()
                  ? "border-primary/40 bg-primary/10"
                  : "border-border text-muted-foreground"
              }`}
            >
              {a}
            </button>
          ))}
        </div>
      )}
      <Input
        type="email"
        placeholder="you@example.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="h-8 text-xs"
      />
      {grantsUnknown ? (
        <p className="text-[11px] text-muted-foreground">
          This address is connected, but we couldn&apos;t read which apps it has. Press Re-check above. If it
          keeps saying this, run <code>gog auth list</code> in a terminal and approve any Keychain prompt.
        </p>
      ) : (
        <>
          <p className="text-[11px] text-muted-foreground">
            {accountGranted
              ? "Ticked apps are already on. Add any others you want — the ones you have stay."
              : "A new address. Pick what it should be able to reach."}
          </p>
          <ServicePicker selected={services} onChange={setServices} granted={accountGranted} />
        </>
      )}
      {address && !grantsUnknown && nothingNew && (
        <p className="text-[11px] text-muted-foreground">
          Everything selected is already on for this address.
        </p>
      )}
      {address && !grantsUnknown && !nothingNew && (
        <>
          <GoogleAutoSetup
            email={address}
            services={services}
            granted={accountGranted}
            claudeReady={claudeReady}
          />
          {claudeReady && <p className="text-[11px] font-medium text-muted-foreground">Or do it yourself:</p>}
          <CommandLine command={`gog auth add ${address} --services ${requested}`} />
          <p className="text-[11px] text-muted-foreground">
            Each new app also needs its API turned on in your Google Cloud project first, or the sign-in will
            refuse it. That&apos;s the part your AI does for you above.
          </p>
        </>
      )}
    </div>
  )
}


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
/**
 * Hands the six-console-page slog to Claude Code's browser integration.
 *
 * Requires the user's own Chrome to be signed in to the same Google account
 * they type here — the agent operates that browser, it does not log in for
 * them. The prompt makes it verify the account before clicking anything,
 * because setting this up against the wrong account silently connects the
 * wrong mailbox.
 */
function GoogleAutoSetup({
  email,
  services,
  granted,
  claudeReady,
}: {
  /** Owned by the parent: both callers already render an address field and a
   *  service picker of their own, and two of each on one card was a real wart. */
  email: string
  services: string[]
  /** Non-empty means this address already works and the agent gets the short
   *  job — enable the extra APIs, re-authorize. The server re-derives this from
   *  gog rather than trusting it; this copy only decides what the card says. */
  granted?: string[]
  claudeReady: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  /** Opens CHROME specifically, not the default browser. A user on Safari
   *  would otherwise check the wrong browser and confirm something untrue —
   *  the agent drives Chrome, so Chrome is what has to be signed in. */
  async function checkAccount() {
    const result = await openChromeAccountCheck()
    if (!result.opened) setMessage("Couldn't open Chrome. Is it installed?")
  }

  async function run() {
    setBusy(true)
    try {
      const result = await setupGoogle(email, services)
      setMessage(result.message)
    } catch {
      setMessage("Couldn't start the setup session.")
    } finally {
      setBusy(false)
    }
  }

  // Gated on Claude Code being installed AND signed in. `--chrome` is its
  // own flag with no equivalent in Codex, Aider or Antigravity, and offering
  // a button that opens a terminal saying "command not found" is the exact
  // dead end this whole slice exists to remove.
  if (!claudeReady) return null

  const expanding = Boolean(granted?.length)

  return (
    <div className="space-y-2 rounded-lg border border-border bg-card/60 p-3">
      <p className="text-sm font-medium">{expanding ? "Let your AI turn them on" : "Let your AI do it"}</p>
      <p className="text-xs text-muted-foreground">
        {expanding
          ? "Opens a window where your AI turns on the extra apps in your existing Google setup, then re-runs the sign-in. Nothing you already have is touched."
          : "Opens a window where your AI clicks through Google's setup pages in your browser. Sign in to Google in Chrome first, with the same address you chose above."}
      </p>

      {/* The one prerequisite this app cannot detect. Chrome's presence is
          checked for real before any spawn; WHICH Google account it is signed
          in as has no API, so it's confirmed here and re-checked by the agent
          in-browser before it clicks anything. Two soft checks around a hard
          one, rather than pretending to know. */}
      <div className="space-y-1.5 rounded-md border border-border bg-background/50 p-2.5">
        <p className="text-[11px] font-medium">First: is Chrome signed in to that account?</p>
        <p className="text-[11px] text-muted-foreground">
          Your AI uses your own Chrome window, so it can only reach the account Chrome is already signed in to.
        </p>
        <Button type="button" size="sm" variant="outline" onClick={checkAccount}>
          <ExternalLink className="mr-1.5 size-3.5" />
          Open Chrome and check
        </Button>
        <label className="flex cursor-pointer items-start gap-2 pt-1 text-[11px] text-muted-foreground">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5"
          />
          <span>Chrome is signed in to this account.</span>
        </label>
      </div>

      <Button size="sm" onClick={run} disabled={busy || !email.trim() || !confirmed}>
        {busy ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Wand2 className="mr-1.5 size-3.5" />}
        {expanding ? "Turn on the extra apps for me" : "Set up Google for me"}
      </Button>
      {message && <p className="text-xs text-muted-foreground">{message}</p>}
    </div>
  )
}

function GoogleSetup({ stage, claudeReady, granted }: { stage: "client" | "account"; claudeReady: boolean; granted?: string[] }) {
  const [email, setEmail] = useState("")
  const [services, setServices] = useState<string[]>(DEFAULT_GOOGLE_SERVICE_IDS)
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
        <ServicePicker selected={services} onChange={setServices} />
        {address && <CommandLine command={`gog auth add ${address} --services ${serviceListArg(services)}`} />}
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

      {/* Address and services live here now, above both routes: this card used
          to render an email field inside GoogleAutoSetup AND another at the
          bottom for the manual command, so the same value was typed twice. */}
      {emailField}
      <p className="text-[11px] text-muted-foreground">
        Which Google apps should it connect? Each one adds a page to click through.
      </p>
      <ServicePicker selected={services} onChange={setServices} granted={granted} />

      {/* The whole point of 0.6: nobody should have to do the six steps below
          by hand. They stay on the page as the fallback, and as the thing the
          agent is literally working through — same array, one source. */}
      <GoogleAutoSetup email={address} services={services} granted={granted} claudeReady={claudeReady} />

      {claudeReady && <p className="text-xs font-medium text-muted-foreground">Or do it yourself:</p>}
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
          <strong>Last step.</strong> With the address above filled in, run this command. It picks up the
          downloaded file and opens the sign-in for you. Approve it, come back, press Re-check.
        </p>
        {address && (
          <CommandLine
            command={`gog auth setup ${address} --credentials ~/Downloads/client_secret_*.json --login --services ${serviceListArg(services)}`}
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
export function InstallButton({ id, onDone }: { id: InstallableId; onDone: () => void }) {
  // The repair agent runs `claude`. Offering it when the missing binary IS
  // claude can only ever report failure, so that card gets the manual steps
  // instead — this is the one tool the fallback cannot bootstrap.
  const canRepair = id !== "claude-code"
  const [busy, setBusy] = useState(false)
  const [repairing, setRepairing] = useState(false)
  const [log, setLog] = useState<string | null>(null)
  const [needsAgent, setNeedsAgent] = useState(false)
  const [repairFailed, setRepairFailed] = useState(false)

  async function run() {
    setBusy(true)
    setLog(null)
    setNeedsAgent(false)
    setRepairFailed(false)
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

  /** The 0.5 fallback. Only reachable after a real failure the user just saw,
   *  never automatic — an agent with Bash is not something to start on a
   *  page render. */
  async function repair() {
    setRepairing(true)
    setRepairFailed(false)
    try {
      const result = await installRepair(id, log ?? "")
      if (result.ok) {
        onDone()
        return
      }
      setRepairFailed(true)
      setLog(result.transcript.trim() || log)
    } catch {
      setRepairFailed(true)
    } finally {
      setRepairing(false)
    }
  }

  return (
    <div className="space-y-2">
      <Button size="sm" onClick={run} disabled={busy}>
        {busy ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : <Download className="mr-1.5 size-3.5" />}
        {busy ? "Installing… this can take a minute" : "Install it for me"}
      </Button>
      {needsAgent && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {repairFailed || !canRepair
              ? "That didn't work automatically. The steps below still do it by hand."
              : "The standard way didn't work on this machine. Your AI can try to sort it out."}
          </p>
          {!repairFailed && canRepair && (
            <Button size="sm" variant="outline" onClick={repair} disabled={repairing}>
              {repairing ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <Wand2 className="mr-1.5 size-3.5" />
              )}
              {repairing ? "Working on it…" : "Let my AI install it"}
            </Button>
          )}
        </div>
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
function SignInButton() {
  const [email, setEmail] = useState("")
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  async function run() {
    setBusy(true)
    try {
      const result = await signInClaude(email)
      // Nothing to call back into: the browser sign-in completes in the
      // terminal we just opened, seconds to minutes from now. Re-checking
      // immediately would show "not signed in" and contradict the message
      // below it. Re-check is the user's move, once they're done.
      setMessage(result.message)
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

function ToolCard({
  tool,
  delay,
  onChanged,
  claudeReady = false,
}: {
  tool: ToolStatus
  delay: number
  onChanged: () => void
  claudeReady?: boolean
}) {
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
            <div className="flex flex-wrap items-center gap-2 pt-0.5">
              {/* Derived from the scopes gog really reports, so the card can
                  never show a service the token was never granted — v64's
                  "keep the marks in sync" rule replaced by not keeping two
                  lists at all. Only some services have a real product mark;
                  the rest are named in text rather than given an invented
                  logo, per the standing no-hand-drawn-vendor-marks rule. */}
              {GOOGLE_SERVICES.filter((svc) => tool.grantedServices?.includes(svc.id)).map((svc) =>
                svc.brand ? (
                  <span
                    key={svc.id}
                    title={svc.label}
                    className="grid size-7 place-items-center rounded-md border border-border bg-background/60"
                  >
                    <BrandIcon id={svc.brand} tone="brand" className="size-3.5" />
                  </span>
                ) : (
                  <span
                    key={svc.id}
                    className="rounded-md border border-border bg-background/60 px-2 py-1 text-[11px] text-muted-foreground"
                  >
                    {svc.label}
                  </span>
                )
              )}
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
            <ConnectGoogleApps
              accounts={tool.accounts ?? []}
              accountServices={tool.accountServices}
              claudeReady={claudeReady}
            />
            <KeychainNote />
          </>
        )}

        {!live && (
          <div className="space-y-3">
            {/* Buttons before instructions: the whole point is that a
                non-technical user never has to reach the instructions. */}
            {tool.installId && <InstallButton id={tool.installId} onDone={onChanged} />}
            {tool.needsSignIn && <SignInButton />}
            {/* Google is the one tool whose setup isn't "run this one command":
                Google requires a per-person OAuth client that only a human can
                create in their console. Rendered before the generic block,
                which for these two stages carries no command of its own. */}
            {tool.id === "google" && (tool.googleStage === "client" || tool.googleStage === "account") && (
              <GoogleSetup stage={tool.googleStage} claudeReady={claudeReady} granted={tool.grantedServices} />
            )}
            {/* Every not-connected stage, INCLUDING `install`. It used to skip
                that one, which is exactly backwards: the popup storm starts the
                moment gog lands on the machine, so the person who most needs
                `gog auth keyring file` is the one who just installed it and has
                never reached a connected card. */}
            {tool.id === "google" && <KeychainNote />}

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
  const advanced = useAdvancedMode()
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

  // Only what's actually on screen: simple mode renders one executor card, so
  // counting all four leaves the help marker permanently lit with nothing to
  // point at.
  // Simple mode shows the default executor plus anything a company is really
  // running on. It never hides an executor in use — a company assigned to
  // Aider whose card you cannot see is worse than one extra card.
  const visibleExecutors = advanced
    ? status.aiExecutors
    : status.aiExecutors.filter((t) => t.id === "claude-code" || t.inUse)
  const anyNotConnected =
    visibleExecutors.some((t) => !t.connected) || !status.google.connected || !status.github.connected

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
        {/* Simple mode shows only the AI that actually runs things by
            default. Four executor cards is a choice a non-technical user has
            no basis to make, and three of them can't be installed or probed
            anyway. Google and GitHub stay: 0.6 made Google one-click and gh's
            sign-in is a browser flow. */}
        {visibleExecutors.map((tool, i) => (
          <ToolCard key={tool.id} tool={tool} delay={i * 90} onChanged={recheck} />
        ))}
        <ToolCard
          tool={status.google}
          delay={status.aiExecutors.length * 90}
          onChanged={recheck}
          claudeReady={status.aiExecutors.some((t) => t.id === "claude-code" && t.connected)}
        />
        <ToolCard tool={status.github} delay={(status.aiExecutors.length + 1) * 90} onChanged={recheck} />
        {/* Notion is connected by running the api-connect skill in a
            terminal — no button here can do it, so it stays advanced. */}
        {/* Same rule: hidden until a company actually has Notion configured,
            then always shown, because at that point it is live state. */}
        {(advanced || status.notion.companies.some((c) => c.connected)) && (
          <NotionCard notion={status.notion} delay={(status.aiExecutors.length + 2) * 90} />
        )}
      </div>
    </div>
  )
}
