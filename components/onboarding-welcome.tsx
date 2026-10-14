"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, ArrowRight, Check, Code2, Loader2, Megaphone, RefreshCw, ShieldCheck, Sparkles, Target, Users, X } from "lucide-react"
import { AlacranMark } from "@/components/alacran-mark"
import { BrandIcon, type BrandId } from "@/components/brand-icon"
import { AddCompanyForm } from "@/components/add-company-form"
import { InstallButton } from "@/components/connect-panel"
import { CommandLine } from "@/components/copy-button"
import { Button } from "@/components/ui/button"
import { checkDependencies } from "@/lib/check-dependencies"
import { recheckConnectStatus } from "@/lib/connect/connect-actions"
import { SignInButton } from "@/components/connect-panel"
import { seedSimpleModeForFreshInstall } from "@/lib/advanced-mode"
import type { DependencyStatus } from "@/lib/check-dependencies-impl"
import type { ConnectStatus, ToolStatus } from "@/lib/connect/connect-status-impl"

type StepId = "purpose" | "trust" | "ready" | "create"

type GoalId = "leadership" | "software" | "sales" | "marketing"

const GOALS: { id: GoalId; title: string; detail: string; packId: string; icon: typeof Target }[] = [
  { id: "leadership", title: "Run my business", detail: "See priorities, decisions, and what needs attention.", packId: "leadership-team", icon: Target },
  { id: "software", title: "Build software", detail: "Plan, ship, test, and document product work.", packId: "software-engineering", icon: Code2 },
  { id: "sales", title: "Win customers", detail: "Keep opportunities moving without losing context.", packId: "sales", icon: Users },
  { id: "marketing", title: "Grow my audience", detail: "Plan campaigns and turn ideas into useful content.", packId: "marketing", icon: Megaphone },
]

const STEPS: { id: StepId; label: string; title: string; blurb: string }[] = [
  {
    id: "purpose",
    label: "Goal",
    title: "What should Alacrán help you accomplish?",
    blurb: "Choose the outcome closest to your work. This only tailors your starting workspace—you can change everything later.",
  },
  {
    id: "trust",
    label: "Trust",
    title: "You stay in control",
    blurb: "Alacrán can prepare work on its own, but consequential actions always stop for your approval.",
  },
  {
    id: "ready",
    label: "AI",
    title: "Connect the AI that does the work",
    blurb: "Alacrán checks your computer and guides the required setup. Business integrations can wait until you need them.",
  },
  {
    id: "create",
    label: "Create",
    title: "Launch your first company",
    blurb:
      "Give it a name and Alacrán sets up a place for everything it learns about your business. Every change it makes is kept, so you can see it and undo it.",
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

export function OnboardingWelcome({ homeDir }: { homeDir: string }) {
  const router = useRouter()
  // Reaching this screen at all means zero companies are registered, which is
  // the only reliable "this install is new" signal the client has. Seeded here
  // rather than by changing readAdvancedMode's default, so no existing user is
  // flipped — see the note on seedSimpleModeForFreshInstall.
  useEffect(() => {
    seedSimpleModeForFreshInstall()
  }, [])

  const [step, setStep] = useState(0)
  const [goal, setGoal] = useState<GoalId | null>(null)
  const [deps, setDeps] = useState<DependencyStatus | null>(null)
  const [connect, setConnect] = useState<ConnectStatus | null>(null)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const inFlight = useRef(false)

  // Read-only probes (`which`, `gog auth status -j`) are safe to repeat, but the
  // ref keeps overlapping runs from racing each other's results.
  const refresh = useCallback(async () => {
    if (inFlight.current) return
    inFlight.current = true
    setPending(true)
    setFailed(false)
    try {
      // recheck*, not the plain read: this refresh fires on window focus, whose
      // whole point is "the user just came back from doing something in their
      // terminal." A memoized answer (lib/exec-memo.ts) would be the stale one
      // at exactly the moment it matters.
      const [d, c] = await Promise.all([checkDependencies(), recheckConnectStatus()])
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
  // Onboarding only ever gates on Claude Code (the one built-in default);
  // the other registered AI executors show up on the full Connect page.
  const claudeConnect = connect?.aiExecutors.find((e) => e.id === "claude-code")

  // Step 2 used to gate Continue on Google, which means: install Homebrew,
  // create an OAuth client across six Cloud Console pages, download a JSON.
  // That is not a step between someone and their first win — it is a wall, and
  // the only way past it was a small grey "Explore without AI" underneath.
  //
  // Claude signed in is the thing that actually blocks a first win, and
  // `connected` on an AI executor already means installed AND signed in
  // (connect-status-impl.ts probes `claude auth status`). Gating on it also
  // closes the case where the app said "Ready" off `which claude` and the
  // first job then hung on a login prompt inside a terminal.
  const stepDone: Record<StepId, boolean> = {
    purpose: goal !== null,
    trust: true,
    ready: claudeConnect?.connected === true,
    create: false,
  }
  const current = STEPS[step]
  const isLast = step === STEPS.length - 1
  const canAdvance = stepDone[current.id]

  return (
    /* overflow-x-clip contains the oversized decorative halo without creating a
       scroll container the way overflow-x-hidden would. */
    <div className="onboarding-first relative mx-auto max-w-4xl overflow-x-clip py-10">
      <div className="a-glow" aria-hidden="true" />

      <header className="relative space-y-3 text-center">
        <AlacranMark className="a-float mx-auto w-20" glow priority />
        <p className="eyebrow">Set up in a few minutes</p>
        <h1 className="font-display text-4xl font-extrabold">Welcome to Alacrán</h1>
        <p className="mx-auto max-w-xl text-sm text-muted-foreground">
          Understand your business, decide what to do next, and safely delegate work to AI—without giving up control of your data.
        </p>
      </header>

      {/* clickable step rail; every step stays reachable, nothing is a dead end */}
      <nav className="relative mt-8 flex items-center gap-2" aria-label="Setup progress">
        {STEPS.map((s, i) => {
          const active = i === step
          // Passed is not done: a skipped AI step must not wear a green tick.
          const done = i <= step && stepDone[s.id]
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
      <section key={current.id} className="a-rise relative mt-7 space-y-5 bento-card p-6 sm:p-8">
        <div className="space-y-1.5">
          <h2 className="font-display text-xl font-bold">{current.title}</h2>
          <p className="text-sm text-muted-foreground">{current.blurb}</p>
        </div>

        {failed && (
          <p className="text-xs text-destructive" role="alert">
            We couldn&apos;t read your machine&apos;s status. Please press Re-check to retry.
          </p>
        )}

        {current.id === "purpose" && (
          <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Primary goal">
            {GOALS.map(({ id, title, detail, icon: Icon }) => {
              const selected = goal === id
              return (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setGoal(id)}
                  className={`onboarding-goal ${selected ? "is-selected" : ""}`}
                >
                  <span><Icon aria-hidden /></span>
                  <span><strong>{title}</strong><small>{detail}</small></span>
                  <span className="onboarding-goal-check">{selected ? <Check aria-hidden /> : null}</span>
                </button>
              )
            })}
          </div>
        )}

        {current.id === "trust" && (
          <div className="onboarding-trust-grid">
            <article><ShieldCheck aria-hidden /><h3>Your company memory is local</h3><p>Definitions, records, notes, and decisions stay as readable files on this computer.</p></article>
            <article><Sparkles aria-hidden /><h3>Your AI sees what it reads</h3><p>To answer, your AI reads your company&apos;s files, and what it reads goes to the AI company you chose. Your files go nowhere else unless you press Back up.</p></article>
            <article><Check aria-hidden /><h3>Changes wait for your OK</h3><p>What the AI writes waits for you to keep or discard. It&apos;s also told to stop and ask before money, contracts, publishing, deleting or access changes.</p></article>
          </div>
        )}

        {current.id === "ready" && (
          <div className="space-y-3" aria-live="polite">
            {!loading && !claudeInstalled ? (
              <>
                {/* The button is the path for this audience; the terminal command
                    used to be the biggest thing on the screen, above it. */}
                <ToolRow brand="claude" name="Claude Code" detail="The AI that does the work in Alacrán. Install it once, then sign in with your Claude account." state="missing" delay={0} />
                <div className="sm:pl-12"><InstallButton id="claude-code" onDone={refresh} /></div>
                {claudeConnect?.guidance.command && (
                  <details className="text-xs text-muted-foreground sm:pl-12">
                    <summary className="cursor-pointer select-none hover:text-foreground">I&apos;d rather install it myself</summary>
                    <div className="mt-2 space-y-2">
                      <CommandLine command={claudeConnect.guidance.command} />
                      {claudeConnect.guidance.link && (
                        <a href={claudeConnect.guidance.link} target="_blank" rel="noreferrer" className="underline-offset-4 hover:underline">
                          Read the install guide →
                        </a>
                      )}
                    </div>
                  </details>
                )}
              </>
            ) : connect && claudeConnect ? (
              <>
                <ConnectRow tool={claudeConnect} brand="claude" delay={0} />
                {claudeConnect.needsSignIn && !claudeConnect.connected && <div className="sm:pl-12"><SignInButton executorId="claude-code" /></div>}
              </>
            ) : (
              <div className="a-sweep h-24 rounded-lg border border-border bg-card/60" aria-hidden="true" />
            )}
            {!claudeConnect?.connected && (
              <p className="text-xs text-muted-foreground">
                Claude Code needs a paid Claude plan (Pro is about $20 a month).{" "}
                <a href="https://claude.com/pricing" target="_blank" rel="noreferrer" className="text-foreground underline-offset-4 hover:underline">
                  See Claude plans →
                </a>
              </p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <p className="text-xs text-muted-foreground">Just installed or signed in? Return here and press Re-check.</p>
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
                  "A folder on this computer for your company's notes, records and decisions",
                  "A full history, so any change can be seen and undone",
                  "Ready-made jobs: a daily summary, a place to record decisions, and look-backs",
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
            <AddCompanyForm
              prominent
              guided
              defaultOpen
              homeDir={homeDir}
              initialPackId={GOALS.find((item) => item.id === goal)?.packId}
              onSuccess={(company) => router.push(`/c/${company.id}/dashboard`)}
            />
            {!loading && !claudeInstalled && (
              <p className="text-xs text-warning">
                You can add company details and records now. Connect AI from Home when you are ready to ask questions or prepare drafts.
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
              {!canAdvance && !loading && current.id !== "purpose" && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                  onClick={() => setStep((s) => s + 1)}
                >
                  Explore without AI
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
