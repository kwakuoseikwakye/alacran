import path from "node:path"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowRight, CheckCircle2, FileText } from "lucide-react"
import { getEffectiveAdapters, getEffectiveAgents } from "@/lib/get-effective-agents"
import { getAllActivities, mergeAndSortActivities } from "@/lib/get-all-activities"
import { listPendingReviews } from "@/lib/company-commands/pending-reviews"
import { COMPANY_COMMANDS_DATA_DIR } from "@/lib/company-commands/paths"
import { checkRunLockStatus } from "@/lib/company-commands/run-lock"
import { getCompanyOntologyImpl } from "@/lib/get-company-ontology-impl"
import { AiSetupCard } from "@/components/os/dashboard/ai-setup-card"
import { FirstRunHero } from "@/components/os/dashboard/first-run-hero"
import { SavedNotice } from "@/components/os/dashboard/saved-notice"
import { MemoryCard } from "@/components/os/dashboard/memory-card"
import { PreferencesOffer } from "@/components/os/dashboard/preferences-offer"
import { OfficeCard } from "@/components/os/dashboard/office-card"
import { loadMemoryHealth } from "@/lib/os/memory-health/load"
import type { MemoryHealth } from "@/lib/os/memory-health/types"
import { loadPreferenceOfferFor } from "@/lib/os/preferences/offer-load"
import { listMemoryItems } from "@/lib/os/memory-items"
import { AlacranMark } from "@/components/alacran-mark"
import { Composer, ComposerSuggestions } from "@/components/os/composer"
import { companyAiStatusImpl } from "@/lib/connect/connect-status-impl"
import { AiChip } from "@/components/os/dashboard/ai-chip"
import { resolveAiExecutorForAgent } from "@/lib/ai-executor-registry"
import { readinessOf } from "@/lib/executor-readiness"
import { greetingFor, plainActivityTitle } from "@/lib/os/dashboard/home-copy"
import { approvalTitle } from "@/lib/os/approval-title"
import { readFirstRun } from "@/lib/os/first-run-state"
import { attentionRowsShow, firstRunStage, homeFocus, homeHeadline, profileAnsweredFrom, savedRecently, type FirstRunStage } from "@/lib/os/first-run"
import { observeGuide } from "@/lib/guide/observe"
import { GuideHomeRow } from "@/components/os/guide/guide-home-row"

export const dynamic = "force-dynamic"

function formattedDate(): string {
  return new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(new Date())
}

/** Activity timestamps are Unix seconds (see lib/adapters). */
function activityTime(timestamp: number): string {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(timestamp * 1000)
}

export default async function DashboardPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params
  const agents = await getEffectiveAgents()
  const agent = agents.find((candidate) => candidate.id === companyId)
  if (!agent) notFound()
  const dataDir = path.join(COMPANY_COMMANDS_DATA_DIR, agent.id)
  const [allPending, ai, adapters, executor, firstRun, run, ontology, guide] = await Promise.all([
    listPendingReviews([agent]),
    companyAiStatusImpl(agent.id),
    getEffectiveAdapters(),
    resolveAiExecutorForAgent(agent.id),
    readFirstRun(dataDir),
    checkRunLockStatus(dataDir),
    getCompanyOntologyImpl(agent.id),
    // Read-only; a folder the app only opens never has a guide to check.
    agent.kind === "command-set" ? observeGuide(agent) : Promise.resolve(null),
  ])
  const pending = allPending.filter((review) => review.agentId === companyId)
  const first = pending[0]
  // getAllActivities already turns an adapter failure into an empty list, so a
  // broken history file can't take Home down with it.
  const recent = mergeAndSortActivities(await getAllActivities([agent], adapters)).slice(0, 3)

  // What Home leads with is decided from facts on disk (lib/os/first-run.ts),
  // never from a browser flag.
  //
  // A folder the app only opens (an "external" company) is not guided at all:
  // the wizard and the first-draft job are command-set features, and that job
  // writes into the folder before anything is approved — into someone else's
  // project. Same rule as every company feature: off for external unless asked.
  const guided = agent.kind === "command-set"
  const stage: FirstRunStage = guided
    ? firstRunStage({
        aiConnected: ai.connected,
        profileAnswered: profileAnsweredFrom(ontology),
        pendingCount: pending.length,
        running: run.running,
        ...firstRun,
      })
    : "done"
  // A stale guide is one more thing waiting, but only where Home shows its plain rows: while the first-run hero
  // leads, nothing else competes with it. First-run itself still counts command reviews only.
  const guideProposal =
    guide && guide.result.kind === "proposal" && !guide.dismissed && attentionRowsShow(stage) ? guide.result.proposal : null
  const attention = pending.length + (guideProposal ? 1 : 0)
  const focus = homeFocus(stage, attention)
  // The memory card is the steady state: it would compete with the hero while
  // that leads, and an external folder has no memory the app manages.
  const showMemory = guided && stage === "done"
  const [memory, health]: [Awaited<ReturnType<typeof listMemoryItems>>, MemoryHealth] = showMemory
    ? await Promise.all([listMemoryItems(agent.rootPath), loadMemoryHealth(agent.rootPath)])
    : [[], { state: "none" }]
  const preferenceOffer = showMemory && executor.enforcesToolScope ? await loadPreferenceOfferFor(agent.id, agent.rootPath) : null

  return (
    <main className="native-home" aria-labelledby="home-title">
      <header className="native-home-intro">
        <AlacranMark className="native-home-mark w-[30px]" priority />
        <h1 id="home-title">{greetingFor(new Date().getHours())}</h1>
        <p>{homeHeadline(stage, attention)}</p>
        <AiChip agentId={agent.id} currentExecutorId={executor.id} currentReadiness={readinessOf(ai)} />
      </header>

      {/* Without a working AI nothing else on this page can happen, so it
          leads, in every stage. */}
      {!ai.connected && <AiSetupCard status={ai} />}

      {/* Who is working right now, for every user. The AI setup card above still leads. */}
      <OfficeCard companyId={companyId} />

      {stage === "done" && savedRecently(firstRun.firstSavedAt) && <SavedNotice />}

      {(stage === "describe" || stage === "review" || stage === "first-draft") && (
        <FirstRunHero
          stage={stage}
          companyId={companyId}
          companyName={agent.name}
          running={run.running}
          pendingTitle={first ? approvalTitle(first.commandId) : undefined}
        />
      )}

      {/* Asking is the one thing every visit can do, so it sits above the fold. */}
      <div className="native-home-ask">
        <Composer companyId={companyId} placeholder={`Ask anything about ${agent.name}`} />
        <ComposerSuggestions companyId={companyId} items={["Prepare my daily brief", "What should I focus on?"]} />
      </div>

      {focus !== "none" && (focus === "caught-up" || first) && (
        <section className="native-home-focus" aria-label="What needs your attention">
          {focus === "review" && first ? (
            <>
              <FileText aria-hidden />
              <div>
                <h2>{approvalTitle(first.commandId)}</h2>
                <p>Alacrán prepared a change for {agent.name}. Read the plain-language preview before deciding.</p>
              </div>
              <Link href={`/c/${companyId}/tasks`}>Review <ArrowRight aria-hidden /></Link>
            </>
          ) : (
            <>
              <CheckCircle2 aria-hidden />
              <div><h2>You&apos;re all caught up</h2><p>Nothing is waiting for your approval.</p></div>
            </>
          )}
        </section>
      )}
      {guideProposal && <GuideHomeRow companyId={companyId} counts={guideProposal.counts} />}

      {showMemory && <MemoryCard companyId={companyId} items={memory} health={health} />}
      {preferenceOffer && <PreferencesOffer companyId={companyId} offer={preferenceOffer} />}

      <section className="native-recent" aria-labelledby="recent-title">
        <div className="native-section-head"><h2 id="recent-title">Recent</h2><span>{formattedDate()}</span></div>
        {recent.length ? recent.map((activity) => (
          <Link key={activity.id} href={`/c/${companyId}/activity`}><span>{plainActivityTitle(activity.title)}</span><small>{activityTime(activity.timestamp)}</small><ArrowRight /></Link>
        )) : <p>Nothing has happened here yet. Ask Alacrán something to get started.</p>}
      </section>
    </main>
  )
}
