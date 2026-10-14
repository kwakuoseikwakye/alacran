import Link from "next/link"
import type { ReactNode } from "react"
import { ArrowRight, Sparkles } from "lucide-react"
import type { FirstRunStage } from "@/lib/os/first-run"
import type { LoopBeatId } from "@/lib/os/loop"
import { LoopStrip } from "@/components/os/loop-strip"
import { LogTailView } from "@/components/log-tail-view"

export type HeroStage = Extract<FirstRunStage, "describe" | "review" | "first-draft">

export type FirstRunHeroViewProps = {
  stage: HeroStage
  companyName: string
  /** review only: a run is in flight. */
  running: boolean
  /** review only: the plain title of the first draft waiting, when one is. */
  pendingTitle?: string
  tasksHref: string
  /** first-draft only: the start request is in flight. */
  busy: boolean
  /** A failed start, in words. */
  message: string | null
  /**
   * The setup wizard. It is rendered in EVERY stage and only hidden outside
   * "describe" (see the slot below), never conditionally removed.
   */
  describeAction: ReactNode
  /** first-draft only: the run started from here ended with nothing to review. */
  endedEmpty?: boolean
  /** What that run printed, for the fold under the message. */
  runLog?: string
  onStart: () => void
  onDismiss: () => void
}

type Copy = { eyebrow: string; title: string; detail: string }

export function heroCopy(p: Pick<FirstRunHeroViewProps, "stage" | "companyName" | "running" | "pendingTitle">): Copy {
  switch (p.stage) {
    case "describe":
      return {
        eyebrow: "Start here",
        title: "Tell Alacrán about your business",
        detail: "Four short questions and a quick check. Alacrán reads your answers before it does anything else.",
      }
    case "first-draft":
      return {
        eyebrow: "Your first draft",
        title: `See what Alacrán can do for ${p.companyName}`,
        detail: "Alacrán writes a short note about what it can help with here. You read it first, and nothing is kept unless you approve it.",
      }
    case "review":
      // A waiting draft wins over "working on it": once there is something to
      // read, that is the next step.
      return p.pendingTitle
        ? {
            eyebrow: "Ready for you",
            title: p.pendingTitle,
            detail: `Alacrán prepared a change for ${p.companyName}. Read the plain-language preview before deciding.`,
          }
        : {
            eyebrow: "Working on it",
            title: "Alacrán is preparing your draft",
            detail: "It will appear in Approvals when it's ready. Nothing is saved until you say yes.",
          }
  }
}

/** Which beat of the loop the hero is about: the person asking, Alacrán drafting, or the person approving. */
export function heroBeat(p: Pick<FirstRunHeroViewProps, "stage" | "running" | "pendingTitle">): LoopBeatId {
  if (p.stage !== "review") return "ask"
  return p.pendingTitle ? "approve" : "draft"
}

/**
 * Home's one next step for a company that has not yet been through the loop.
 * Static on purpose (no hooks): the client container owns the actions, this
 * owns the words, so the words can be tested without a browser.
 */
export function FirstRunHeroView(props: FirstRunHeroViewProps) {
  const { stage, tasksHref, busy, message, describeAction, endedEmpty, runLog, onStart, onDismiss, pendingTitle } = props
  const copy = heroCopy(props)
  const showEmptyRun = stage === "first-draft" && !!endedEmpty && !busy
  return (
    <section className="home-first-welcome first-run-hero" aria-labelledby="first-run-title">
      <span className="home-first-welcome-icon">
        <Sparkles aria-hidden />
      </span>
      <div>
        <LoopStrip current={heroBeat(props)} />
        <p>{copy.eyebrow}</p>
        <h2 id="first-run-title">{copy.title}</h2>
        <span>{copy.detail}</span>
        {message && <span role="status">{message}</span>}
        {showEmptyRun && (
          <>
            <span role="status">
              The last run finished without leaving a draft. Your AI may be busy, signed out, or out of usage. You can try again.
            </span>
            {runLog && (
              <details>
                <summary className="home-first-dismiss">Show what happened</summary>
                <LogTailView content={runLog} />
              </details>
            )}
          </>
        )}
        <button type="button" className="home-first-dismiss" onClick={onDismiss}>
          I know how this works
        </button>
      </div>
      {stage === "first-draft" && (
        <button type="button" className="home-first-cta" onClick={onStart} disabled={busy}>
          {busy ? "Starting…" : "Prepare my first draft"}
        </button>
      )}
      {stage === "review" && (
        <Link href={tasksHref}>
          {pendingTitle ? "Review" : "Open Approvals"}
          <ArrowRight aria-hidden />
        </Link>
      )}
      {/*
        The wizard lives in this ONE slot in every stage, last, and is only
        hidden outside "describe". Home refreshes itself every 15 seconds
        (components/auto-refresh.tsx in the root layout), and the moment a draft
        run starts the stage flips to "review": a wizard rendered only for
        "describe" was unmounted there, closing its dialog mid-run and losing
        the hand-off. The dialog itself is portaled, so hiding this wrapper
        hides the trigger button and leaves an open dialog alone.
      */}
      <div className="first-run-hero-wizard" hidden={stage !== "describe"}>
        {describeAction}
      </div>
    </section>
  )
}
