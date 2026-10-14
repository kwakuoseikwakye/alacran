import os from "node:os"
import {
  getEffectiveAgents,
  getEffectiveAdapters,
  getEffectiveSkillAdapters,
} from "@/lib/get-effective-agents"
import { getAllActivities, mergeAndSortActivities } from "@/lib/get-all-activities"
import { getAllSkills, mergeAndSortSkills } from "@/lib/get-all-skills"
import { AgentCard } from "@/components/agent-card"
import { Workspace } from "@/components/workspace"
import { AddCompanyForm } from "@/components/add-company-form"
import { getAvatars } from "@/lib/avatars-registry"
import { OnboardingWelcome } from "@/components/onboarding-welcome"
import { listGoogleAccountEmails } from "@/lib/google-accounts"
import { getAgentCardFlags } from "@/lib/agent-card-flags"
import { isAppManagedSkillPath } from "@/lib/vendored-skills"
import { listPendingReviews } from "@/lib/company-commands/pending-reviews"
import { getRunSignals } from "@/lib/company-commands/run-signals"
import { departmentsByPath } from "@/lib/skills/departments"
import { getCompanyTerminalStatus } from "@/lib/terminal/sessions"
import { enterCompany } from "@/lib/enter-company"
import { listLiveLinksImpl } from "@/lib/sharing/actions-impl"

/**
 * The one workspace — what used to be `/` (Agents) and `/skills` (files).
 *
 * Both pages described the same object: a company. This loads both halves once
 * and hands them to `components/workspace.tsx`, which decides whether the
 * right-hand pane shows every company, one company, or one file. The OS shell
 * mounts it twice: bare at `/` (the picker), and with `initialCompanyId` set at
 * `/c/[companyId]/files` (that company's tree, open on arrival).
 *
 * Every `AgentCard` is rendered HERE, on the server, and passed down as a node
 * keyed by agent id. That is what lets the card keep all thirteen of its
 * controls through the merge — it reads `os.homedir()` and could not move to
 * the client.
 *
 * It is handed over TWICE, from one props object: `panels` carries the controls
 * and backs the single-company view, `tiles` carries none and backs the
 * overview grid, where a card is a thing you click rather than a control panel.
 */
export async function WorkspaceView({
  initialCompanyId = null,
}: {
  initialCompanyId?: string | null
}) {
  const homeDir = os.homedir()
  const [agents, adapters, skillAdapters, avatars] = await Promise.all([
    getEffectiveAgents(),
    getEffectiveAdapters(),
    getEffectiveSkillAdapters(),
    getAvatars(),
  ])
  if (agents.length === 0) {
    return (
      <div className="dash-content">
        <OnboardingWelcome homeDir={homeDir} />
      </div>
    )
  }

  const avatarByAgentId = Object.fromEntries(avatars.map((a) => [a.agentId, a.imageUrl]))

  const [activityResults, availableGoogleAccounts, skillResults, pending, runSignals] = await Promise.all([
    getAllActivities(agents, adapters),
    listGoogleAccountEmails(),
    getAllSkills(agents, skillAdapters),
    listPendingReviews(agents),
    getRunSignals(agents),
  ])

  const shareLinks = await listLiveLinksImpl(async () => agents).catch(() => [])
  const entries = mergeAndSortSkills(skillResults)
  // Which department each file belongs to, derived from the pack that ships it
  // (lib/skills/departments.ts). Computed here because that module reads
  // templates/ off disk and the tree is a client component.
  const departmentByPath = await departmentsByPath(entries.map((e) => e.path))
  // Skills the app installed and keeps updated: read-only, because the next
  // update replaces them wholesale. The write path refuses them too
  // (resolveWritableSkillPath) — this only removes the affordance, so nobody
  // types into a box whose save is going to be rejected.
  const rootByAgentId = new Map(skillResults.map((r) => [r.agent.id, r.agent.rootPath]))
  const appManagedPaths = (
    await Promise.all(
      entries.map(async (entry) => {
        const rootPath = rootByAgentId.get(entry.agentId)
        if (!rootPath) return null
        return (await isAppManagedSkillPath(rootPath, entry.path)) ? entry.path : null
      })
    )
  ).filter((p): p is string => p !== null)

  // Two cards per company from ONE props object: the panel carries every
  // control, the tile carries none (it is the overview grid, where a card is
  // something you click). Sharing the props is what stops the two from
  // drifting — every `show*` prop is optional, so a flag supplied to one and
  // forgotten on the other would vanish silently rather than fail `tsc`.
  const cards = await Promise.all(
    activityResults.map(async (result, index) => {
      const latest = mergeAndSortActivities([result])[0] ?? null
      const flags = await getAgentCardFlags(result.agent)
      const props = {
        agent: result.agent,
        latestActivity: latest,
        error: result.error,
        avatarUrl: avatarByAgentId[result.agent.id] ?? null,
        availableGoogleAccounts,
        index,
        terminalStatus: getCompanyTerminalStatus(result.agent.id),
        ...flags,
      }
      return {
        id: result.agent.id,
        panel: <AgentCard key={result.agent.id} {...props} />,
        tile: <AgentCard key={result.agent.id} {...props} layout="tile" />,
      }
    })
  )
  const panels = Object.fromEntries(cards.map((c) => [c.id, c.panel]))
  const tiles = Object.fromEntries(cards.map((c) => [c.id, c.tile]))

  const scopedName = initialCompanyId
    ? agents.find((a) => a.id === initialCompanyId)?.name ?? null
    : null

  return (
    <>
      <header className="company-picker-intro a-rise">
        <div>
          <p className="eyebrow">{scopedName ? scopedName : "Alacrán"}</p>
          <h1>{scopedName ? "Files" : "Choose a company"}</h1>
          <p>
            {scopedName
              ? "Everything in this company's folder — definitions, notes, docs, and skills."
              : "Pick up where you left off, or create a separate space for another business."}
          </p>
        </div>
        {scopedName ? null : (
          <div className="mt-1">
            <AddCompanyForm homeDir={homeDir} />
          </div>
        )}
      </header>
      <div className="dash-content">
        <Workspace
          results={skillResults}
          entries={entries}
          panels={panels}
          tiles={tiles}
          appManagedPaths={appManagedPaths}
          departmentByPath={departmentByPath}
          pendingKeys={pending.map((p) => `${p.agentId}:${p.commandId}`)}
          runSignals={runSignals}
          avatarByAgentId={avatarByAgentId}
          initialCompanyId={initialCompanyId}
          shareLinks={shareLinks}
          // Only the true picker (`/`, no initial company) enters the OS on a
          // tile click. `/c/[companyId]/files`'s "switch company" grid keeps
          // the existing in-page focus — it's browsing files, not the front
          // door.
          onOpenCompany={initialCompanyId === null ? enterCompany : undefined}
        />
      </div>
    </>
  )
}
