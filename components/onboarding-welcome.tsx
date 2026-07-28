"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowLeft, ArrowRight, Check, Loader2, RefreshCw, X } from "lucide-react"
import { AlacranMark } from "@/components/alacran-mark"
import { BrandIcon, type BrandId } from "@/components/brand-icon"
import { AddCompanyForm } from "@/components/add-company-form"
import { CommandLine } from "@/components/copy-button"
import { Button } from "@/components/ui/button"
import { checkDependencies } from "@/lib/check-dependencies"
import { getConnectStatus } from "@/lib/connect/connect-actions"
import type { DependencyStatus } from "@/lib/check-dependencies-impl"
import type { ConnectStatus, ToolStatus } from "@/lib/connect/connect-status-impl"

type StepId = "install" | "connect" | "create"

const STEPS: { id: StepId; label: string; title: string; blurb: string }[] = [
  {
    id: "install",
    label: "Install",
    title: "Install the two tools Alacrán drives",
    blurb:
      "Alacrán never installs anything behind your back — it detects what's on your machine and tells you exactly what's missing.",
  },
  {
    id: "connect",
    label: "Connect",
    title: "Sign in to the accounts your company will use",
    blurb:
      "Signing in happens in your own terminal and browser. Alacrán only reads whether it worked — no keys or tokens are ever stored here.",
  },
  {
    id: "create",
    label: "Create",
    title: "Create your first company",
    blurb:
      "This scaffolds a complete company from the built-in template and puts it under git, so every later change is a diff you approve.",
  },
]

/* ------------------------------------------------------------------ atoms */

type ToolState = "checking" | "ok" | "missing" | "optional"

function StatusChip({ state, missingLabel }: { state: ToolState; missingLabel: string }) {
  if (state === "checking") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        checking…
      </span>
    )
  }
  if (state === "ok") {
    return (
      <span className="a-pop flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">
        <Check className="h-3 w-3" />
        Ready
      </span>
    )
  }
  if (state === "optional") {
    return (
      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
        Optional
      </span>
    )
  }
  return (
    <span className="a-pop flex items-center gap-1 rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-semibold text-destructive">
      <X className="h-3 w-3" />
      {missingLabel}
    </span>
  )
}

function ToolRow({
  brand,
  name,
  detail,
  state,
  command,
  link,
  delay,
  missingLabel = "Missing",
}: {
  brand: BrandId
  name: string
  detail: string
  state: ToolState
  command?: string
  link?: string
  delay: number
  /** "Missing" reads right for an uninstalled binary, "Not connected" for a login. */
  missingLabel?: string
}) {
  const live = state === "ok"
  return (
    <div
      className="a-rise space-y-3 rounded-lg border border-border bg-card/60 p-4 transition-colors hover:border-border/80"
      style={{ "--d": `${delay}ms` } as React.CSSProperties}
    >
      <div className="flex items-start gap-3">
        <span
          className={`grid size-9 shrink-0 place-items-center rounded-lg border transition-colors ${
            live ? "border-success/30 bg-success/10" : "border-border bg-background/60"
          }`}
        >
          <BrandIcon id={brand} tone={live ? "brand" : "inherit"} className="size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold">{name}</p>
            <StatusChip state={state} missingLabel={missingLabel} />
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">{detail}</p>
        </div>
      </div>
      {command && (
        <div className="space-y-2 sm:pl-12">
          <CommandLine command={command} />
          {link && (
            <a
              className="inline-block text-xs text-primary underline-offset-4 hover:underline"
              href={link}
              target="_blank"
              rel="noreferrer"
            >
              Read the install guide →
            </a>
          )}
        </div>
      )}
    </div>
  )
}

function RecheckButton({ pending, onClick }: { pending: boolean; onClick: () => void }) {
  return (
    <Button type="button" variant="outline" size="sm" onClick={onClick} disabled={pending}>
      <RefreshCw className={`h-3.5 w-3.5 ${pending ? "animate-spin" : ""}`} />
      {pending ? "Checking…" : "Re-check"}
    </Button>
  )
}

/* ------------------------------------------------------------------ shell */

export function OnboardingWelcome() {
  const [step, setStep] = useState(0)
  const [deps, setDeps] = useState<DependencyStatus | null>(null)
  const [connect, setConnect] = useState<ConnectStatus | null>(null)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const inFlight = useRef(false)

  // Read-only probes (`which`, `gog auth status -j`) — safe to repeat, but the
  // ref keeps overlapping runs from racing each other's results.
  const refresh = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    setPending(true)
    setFailed(false)
    try {
      const [d, c] = await Promise.all([checkDependencies(), getConnectStatus()])
      setDeps(d)
      setConnect(c)
    } catch {
      setFailed(true)
    } finally {
      setPending(false)
      inFlight.current = false
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  // The user leaves to run an install or a `gog auth setup` in their terminal;
  // re-probing when they come back makes the flow feel live without polling.
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === "visible") void refresh()
    }
    window.addEventListener("focus", onFocus)
    document.addEventListener("visibilitychange", onFocus)
    return () => {
      window.removeEventListener("focus", onFocus)
      document.removeEventListener("visibilitychange", onFocus)
    }
  }, [refresh])

  const loading = deps === null || connect === null
  const claudeInstalled = deps?.claude === true

  const stepDone: Record<StepId, boolean> = {
    install: claudeInstalled,
    connect: connect?.google.connected === true,
    create: false,
  }
  const current = STEPS[step]
  const isLast = step === STEPS.length - 1
  const canAdvance = stepDone[current.id]

  const toolState = (ready: boolean | undefined, optional = false): ToolState => {
    if (loading) return "checking"
    if (ready) return "ok"
    return optional ? "optional" : "missing"
  }

  return (
    /* overflow-x-clip contains the oversized decorative halo without creating a
       scroll container the way overflow-x-hidden would. */
    <div className="relative mx-auto max-w-2xl overflow-x-clip py-10">
      <div className="a-glow" aria-hidden="true" />

      <header className="relative space-y-3 text-center">
        <AlacranMark className="a-float mx-auto w-20" glow priority />
        <p className="eyebrow">
          Step {step + 1} of {STEPS.length}
        </p>
        <h1 className="font-display text-3xl font-extrabold">Welcome to Alacrán</h1>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">
          Three steps to a running AI-native company on this machine. Nothing leaves your Mac.
        </p>
      </header>

      {/* clickable step rail — every step stays reachable, nothing is a dead end */}
      <nav className="relative mt-8 flex items-center gap-2" aria-label="Setup progress">
        {STEPS.map((s, i) => {
          const done = stepDone[s.id]
          const active = i === step
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setStep(i)}
              aria-current={active ? "step" : undefined}
              className="group flex flex-1 flex-col gap-2 text-left"
            >
              <span
                className={`h-1 rounded-full transition-all duration-500 ${
                  active
                    ? "bg-primary shadow-[0_0_12px_var(--primary)]"
                    : done
                      ? "bg-success/70"
                      : "bg-border group-hover:bg-muted-foreground/40"
                }`}
              />
              <span className="flex items-center gap-1.5 text-xs font-semibold">
                <span
                  className={`grid size-4 place-items-center rounded-full text-[10px] transition-colors ${
                    done
                      ? "bg-success text-background"
                      : active
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {done ? <Check className="h-2.5 w-2.5" /> : i + 1}
                </span>
                <span className={active ? "text-foreground" : "text-muted-foreground"}>{s.label}</span>
              </span>
            </button>
          )
        })}
      </nav>

      {/* the `key` restarts the entrance animation on every step change */}
      <section key={current.id} className="a-rise relative mt-7 space-y-5">
        <div className="space-y-1.5">
          <h2 className="font-display text-xl font-bold">{current.title}</h2>
          <p className="text-sm text-muted-foreground">{current.blurb}</p>
        </div>

        {failed && (
          <p className="text-xs text-destructive" role="alert">
            Couldn&apos;t read your machine&apos;s status — press Re-check to retry.
          </p>
        )}

        {current.id === "install" && (
          <div className="space-y-3" aria-live="polite">
            <ToolRow
              brand="claude"
              name="Claude Code"
              detail={
                claudeInstalled
                  ? "Installed and on your PATH."
                  : "The agent that does the work. Required."
              }
              state={toolState(deps?.claude)}
              command={loading || claudeInstalled ? undefined : "npm install -g @anthropic-ai/claude-code"}
              link={
                loading || claudeInstalled ? undefined : "https://docs.claude.com/en/docs/claude-code/overview"
              }
              delay={0}
            />
            <ToolRow
              brand="google"
              name="gog — Google CLI"
              detail={
                deps?.gog
                  ? "Installed and on your PATH."
                  : "Only needed for Gmail and Calendar workflows. You can add it later."
              }
              state={toolState(deps?.gog, true)}
              command={loading || deps?.gog ? undefined : "brew install gogcli/tap/gog"}
              link={loading || deps?.gog ? undefined : "https://github.com/gogcli/gog"}
              delay={90}
            />
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <p className="text-xs text-muted-foreground">
                Just installed something? This re-checks itself when you come back to the window.
              </p>
              <RecheckButton pending={pending} onClick={() => void refresh()} />
            </div>
          </div>
        )}

        {current.id === "connect" && (
          <div className="space-y-3" aria-live="polite">
            {connect ? (
              <>
                <ConnectRow tool={connect.claude} brand="claude" delay={0} />
                <ConnectRow tool={connect.google} brand="google" delay={90} />
              </>
            ) : (
              <div className="a-sweep h-24 rounded-lg border border-border bg-card/60" aria-hidden="true" />
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <a className="text-xs text-primary underline-offset-4 hover:underline" href="/connect">
                Open the full Connect page →
              </a>
              <RecheckButton pending={pending} onClick={() => void refresh()} />
            </div>
          </div>
        )}

        {current.id === "create" && (
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-card/60 p-4">
              <p className="text-sm font-semibold">What gets created</p>
              <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                {[
                  "A company directory scaffolded from the built-in template",
                  "A git repository, so every change has history and an undo",
                  "Ready-to-run commands: inbox check, digest, decisions, retros",
                ].map((item, i) => (
                  <li
                    key={item}
                    className="a-rise flex gap-2"
                    style={{ "--d": `${i * 70}ms` } as React.CSSProperties}
                  >
                    <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <AddCompanyForm prominent />
            {!loading && !claudeInstalled && (
              <p className="text-xs text-warning">
                Claude Code isn&apos;t installed yet — you can still create the company, but its commands
                won&apos;t run until you do.
              </p>
            )}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>

          {!isLast && (
            <div className="flex items-center gap-3">
              {!canAdvance && !loading && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  onClick={() => setStep((s) => s + 1)}
                >
                  Skip for now
                </button>
              )}
              <Button
                type="button"
                size="sm"
                onClick={() => setStep((s) => s + 1)}
                disabled={!canAdvance}
                className={canAdvance ? "shadow-[0_8px_26px_-10px_var(--primary)]" : ""}
              >
                Continue
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

function ConnectRow({ tool, brand, delay }: { tool: ToolStatus; brand: BrandId; delay: number }) {
  return (
    <ToolRow
      brand={brand}
      name={tool.label}
      detail={tool.detail}
      state={tool.connected ? "ok" : "missing"}
      missingLabel="Not connected"
      command={tool.connected ? undefined : tool.guidance.command}
      link={tool.connected ? undefined : tool.guidance.link}
      delay={delay}
    />
  )
}
