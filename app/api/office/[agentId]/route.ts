import path from "node:path"
import { refuseNonLocal } from "@/lib/http/local-request"
import { getEffectiveAgents } from "@/lib/get-effective-agents"
import { listSessions } from "@/lib/terminal/sessions"
import { listWorkspaces } from "@/lib/terminal/workspaces"
import { listRunsImpl } from "@/lib/agent-runs/run-engine"
import { listPendingReviews } from "@/lib/company-commands/pending-reviews"
import { checkRunLockStatus } from "@/lib/company-commands/run-lock"
import { readRunningCommand } from "@/lib/company-commands/running-command"
import { COMPANY_COMMANDS_DATA_DIR } from "@/lib/company-commands/paths"
import { readLastRunsStrict, readSchedulesStrict } from "@/lib/schedules/schedules-impl"
import { resolveAiExecutorForAgent } from "@/lib/ai-executor-registry"
import { COMPANY_STARTER_PACKS } from "@/lib/company-starter-packs"
import { isPackInstalled } from "@/lib/vendored-skills"
import { getCompanyDepartments } from "@/lib/os/departments/registry"
import { buildOffice } from "@/lib/os/office/build-office"
import { HQ_ROOM, type DepartmentInfo, type InstalledPack } from "@/lib/os/office/rooms"

export const dynamic = "force-dynamic"

const PACKS_ROOT = path.join(process.cwd(), "templates", "packs")

/** One source failing becomes an Error for that source alone, never a failed response. */
function settle<T>(work: () => Promise<T> | T): Promise<T | Error> {
  return Promise.resolve()
    .then(work)
    .catch((error: unknown) => (error instanceof Error ? error : new Error(String(error))))
}

async function installedPacks(rootPath: string): Promise<InstalledPack[]> {
  const packs: InstalledPack[] = []
  for (const pack of COMPANY_STARTER_PACKS) {
    if (pack.dirName && (await isPackInstalled(rootPath, pack.dirName, PACKS_ROOT))) {
      packs.push({ id: pack.id, label: pack.label, category: pack.category })
    }
  }
  return packs
}

async function departmentsOf(rootPath: string): Promise<DepartmentInfo[]> {
  // No ontology: it only fills each department's roles, which the office does not show.
  return getCompanyDepartments(rootPath, null).map(({ slug, name, color, recordsCount }) => ({
    slug,
    name,
    // The registry always sets one; the type just doesn't say so. Same neutral teamRoom falls back to.
    color: color ?? HQ_ROOM.color,
    recordsCount,
  }))
}

/**
 * Who is working for this company right now, and where, for the office card on Home.
 * Read-only by construction: unlike the terminal route's GET this does not
 * reconcile runs, so polling it every few seconds changes nothing on disk.
 */
export async function GET(request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const refusal = refuseNonLocal(request)
  if (refusal) return refusal

  const { agentId } = await params
  const agent = (await getEffectiveAgents()).find((a) => a.id === agentId)
  if (!agent) return new Response("Unknown company", { status: 404 })

  const dataDir = path.join(COMPANY_COMMANDS_DATA_DIR, agent.id)
  const [sessions, runs, lock, pendingReviews, schedules, lastRuns, companyExecutorId, workspaces, packs, departments] = await Promise.all([
    settle(() => listSessions(agent.id)),
    settle(() => listRunsImpl(agent.id)),
    settle(() => checkRunLockStatus(dataDir)),
    settle(() => listPendingReviews([agent])),
    settle(() => readSchedulesStrict()),
    settle(() => readLastRunsStrict()),
    settle(async () => (await resolveAiExecutorForAgent(agent.id)).id),
    settle(() => listWorkspaces(agent.id)),
    settle(() => installedPacks(agent.rootPath)),
    settle(() => departmentsOf(agent.rootPath)),
  ])
  // Trusted only while the lock is held: a marker left by a finished or crashed run is ignored.
  const runningCommand = lock instanceof Error || !lock.running ? null : await readRunningCommand(dataDir)

  return Response.json(
    buildOffice({
      companyId: agent.id,
      now: new Date(),
      sessions,
      runs,
      commandRunning: lock instanceof Error ? lock : lock.running,
      runningCommand,
      pendingReviews,
      schedules,
      lastRuns,
      companyExecutorId,
      workspaces,
      packs,
      departments,
    })
  )
}
