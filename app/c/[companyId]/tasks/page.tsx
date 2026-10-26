import path from "node:path"
import { notFound } from "next/navigation"
import { getEffectiveAgents } from "@/lib/get-effective-agents"
import { listPendingReviews } from "@/lib/company-commands/pending-reviews"
import { listPosts } from "@/lib/content-social/posts"
import { COMPANY_COMMANDS_DATA_DIR } from "@/lib/company-commands/paths"
import { TasksBoard } from "@/components/os/tasks-board"
import { PostList } from "@/components/content-social/post-list"
import { LoopStrip } from "@/components/os/loop-strip"
import { readFirstRun } from "@/lib/os/first-run-state"
import { savedRecently } from "@/lib/os/first-run"
import { observeGuide } from "@/lib/guide/observe"
import { GuideProposalCard } from "@/components/os/guide/guide-proposal-card"
import { openFlags, openHeld } from "@/lib/jobs/view"
import { JobFlagList } from "@/components/os/jobs/job-flag-list"
import { HeldActionList } from "@/components/os/jobs/held-action-list"

export const dynamic = "force-dynamic"

export default async function TasksPage({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await params
  const agents = await getEffectiveAgents()
  const agent = agents.find((a) => a.id === companyId)
  if (!agent) notFound()

  // Same read, same filter `app/c/[companyId]/layout.tsx` uses for the
  // subnav's Tasks badge — the badge counts pending JOBS (one make-posts run
  // is one badge count), while a make-posts run below shows one card per
  // waiting post, so the badge number and the card count can legitimately
  // differ.
  const reviews = (await listPendingReviews(agents)).filter((r) => r.agentId === companyId)
  const firstRun = await readFirstRun(path.join(COMPANY_COMMANDS_DATA_DIR, agent.id))
  // A stale guide waits here too, as a card of its own (it is not a command run). Read-only; "Not now" hides it.
  const guide = await observeGuide(agent)
  const guideProposal = guide.result.kind === "proposal" && !guide.dismissed ? guide.result.proposal : null
  // What unattended jobs couldn't decide (v240). Counted in the badge, so it has to be visible here.
  const jobFlags = await openFlags(agent.id).catch(() => [])
  // Steps jobs held for the owner's OK (v248). Also counted in the badge; an unreadable queue is said, not shown as empty.
  const held = await openHeld(agent.id)
  const now = Date.now()
  const jobsNeedYou = jobFlags.length > 0 || !held.ok || held.items.length > 0
  const postReviews = reviews.filter((r) => r.commandId === "make-posts")
  const otherReviews = reviews.filter((r) => r.commandId !== "make-posts")
  const waitingPosts = postReviews.length
    ? (await listPosts(agent.rootPath, path.join(COMPANY_COMMANDS_DATA_DIR, agent.id, "make-posts.run.json"))).filter((p) => p.state === "waiting")
    : []

  return (
    <>
      <header className="dash-topbar a-rise">
        <div>
          <p className="eyebrow">Waiting on you</p>
          <h1>Approvals</h1>
          <p>Everything Alacrán drafts for {agent.name} waits here for your yes. Approve it, ask for changes, or discard it.</p>
          <LoopStrip current="approve" />
        </div>
      </header>
      <div className="dash-content tasks-page">
        {waitingPosts.length > 0 && (
          <section aria-labelledby="posts-waiting"><h2 id="posts-waiting">Posts to approve</h2><PostList posts={waitingPosts} agentId={agent.id} empty="" /></section>
        )}
        {/* Always mounted, so the result of the owner's last decision survives the queue emptying. */}
        <HeldActionList companyId={companyId} items={held.ok ? held.items : []} unreadable={!held.ok} now={now}>
          {jobFlags.length > 0 && <JobFlagList companyId={companyId} flags={jobFlags} linkToJobs />}
        </HeldActionList>
        <GuideProposalCard companyId={companyId} proposal={guideProposal} />
        <TasksBoard
          reviews={waitingPosts.length > 0 ? otherReviews : reviews}
          companyId={companyId}
          justSaved={savedRecently(firstRun.firstSavedAt)}
          suppressEmpty={guideProposal !== null || jobsNeedYou}
        />
      </div>
    </>
  )
}
