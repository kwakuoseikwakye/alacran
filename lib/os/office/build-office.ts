import type { SessionSummary } from "@/lib/terminal/sessions"
import type { RunSummary } from "@/lib/agent-runs/run-engine"
import type { PendingReview } from "@/lib/company-commands/pending-reviews"
import type { RunningCommand } from "@/lib/company-commands/running-command"
import { getCompanyCommand } from "@/lib/company-commands/registry"
import { DEFAULT_WORKSPACE_ID, type Workspace } from "@/lib/terminal/workspace-model"
import { statusView, type RunTone } from "@/lib/agent-runs/run-view"
import { localStamp, scheduleKey, type LastRun, type Schedule } from "@/lib/schedules/schedules-impl"
import { approvalTitle } from "@/lib/os/approval-title"
import { HOT_DESKS, YOUR_DESK, type Desk, type Office, type Room, type Worker, type WorkerState } from "./types"
import {
  buildRoomList,
  departmentRoom,
  HQ_ROOM,
  residentsFor,
  roomIdForCommand,
  roomIdForWorkspace,
  teamRoom,
  type DepartmentInfo,
  type InstalledPack,
} from "./rooms"

/** Each source arrives already settled: a failure is an Error for that source alone. */
export type OfficeInput = {
  companyId: string
  now: Date
  sessions: SessionSummary[] | Error
  runs: RunSummary[] | Error
  commandRunning: boolean | Error
  /** What the runner is running; the route reads it only while the lock is held. */
  runningCommand: RunningCommand | null
  pendingReviews: PendingReview[] | Error
  schedules: Schedule[] | Error
  lastRuns: Record<string, LastRun> | Error
  /** The company's own AI. A pending approval is assumed to be its work. */
  companyExecutorId: string | null | Error
  workspaces: Workspace[] | Error
  packs: InstalledPack[] | Error
  departments: DepartmentInfo[] | Error
}

/** The run card's own tones (run-view.ts), so the office and the card never disagree. */
const TONE_STATE: Record<RunTone, WorkerState | null> = {
  working: "working",
  driving: "working",
  review: "waiting",
  stopped: "failed",
  quiet: null,
}

const plainCommand = (commandId: string) => commandId.replaceAll("-", " ")

/** What every desk needs, computed once. Unreadable placement sources degrade to "no rooms", never to an error. */
type Context = {
  input: OfficeInput
  companyExecutorId: string | null
  workspaces: Workspace[]
  packs: InstalledPack[]
  departments: DepartmentInfo[]
  /** Every room a worker could be routed to, before the cap. */
  candidates: Room[]
  departmentSlugs: Set<string>
}

function context(input: OfficeInput): Context {
  const packs = input.packs instanceof Error ? [] : input.packs
  const departments = input.departments instanceof Error ? [] : input.departments
  return {
    input,
    companyExecutorId: input.companyExecutorId instanceof Error ? null : input.companyExecutorId,
    workspaces: input.workspaces instanceof Error ? [] : input.workspaces,
    packs,
    departments,
    candidates: [HQ_ROOM, ...packs.map(teamRoom), ...departments.map(departmentRoom)],
    departmentSlugs: new Set(departments.map((d) => d.slug)),
  }
}

function terminalDesk(ctx: Context): Desk {
  const { companyId, sessions } = ctx.input
  if (sessions instanceof Error) return { id: "terminal", workers: [], unreadable: "Can't read terminals" }
  const workers = sessions
    .filter((s) => s.kind === "ai")
    .map((s): Worker => {
      // A session that names no workspace counts under Main, as countSessions does.
      const workspace = ctx.workspaces.find((w) => w.id === (s.workspaceId ?? DEFAULT_WORKSPACE_ID))
      return {
        id: `terminal:${s.id}`,
        label: s.label,
        state: "working",
        startedAt: new Date(s.startedAt).toISOString(),
        href: `/c/${companyId}/terminal`,
        executorId: s.executorId ?? null,
        roomId: roomIdForWorkspace(workspace?.name, ctx.candidates, ctx.packs) ?? HOT_DESKS,
      }
    })
  return { id: "terminal", workers }
}

function runsDesk(ctx: Context): Desk {
  const { companyId, commandRunning, pendingReviews, runs, sessions, runningCommand } = ctx.input
  const workers: Worker[] = []
  const unread: string[] = []
  const tasks = `/c/${companyId}/tasks`

  if (commandRunning instanceof Error) unread.push("company commands")
  else if (commandRunning) {
    const command = runningCommand ? getCompanyCommand(runningCommand.commandId) : undefined
    workers.push({
      id: "command:running",
      label: command?.label ?? "Company command",
      state: "working",
      startedAt: runningCommand?.startedAt ?? null,
      href: tasks,
      executorId: runningCommand ? runningCommand.executorId : ctx.companyExecutorId,
      roomId: runningCommand
        ? roomIdForCommand(runningCommand.commandId, command?.outputPath ?? null, ctx.departmentSlugs)
        : HQ_ROOM.id,
    })
  }

  if (pendingReviews instanceof Error) unread.push("approvals")
  else {
    for (const review of pendingReviews) {
      if (review.agentId !== companyId) continue
      workers.push({
        id: `review:${review.commandId}`,
        label: approvalTitle(review.commandId),
        state: "waiting",
        startedAt: null,
        href: tasks,
        executorId: ctx.companyExecutorId,
        roomId: YOUR_DESK,
      })
    }
  }

  if (runs instanceof Error) unread.push("agent runs")
  else {
    // A run that is really working has its own live "run" session. A record still saying
    // "running" without one outlived its process (the app closed mid-run) and only the
    // Terminal page reconciles it, so it shows as needing a look, never as working.
    const live = sessions instanceof Error ? null : new Set(sessions.filter((s) => s.kind === "run").map((s) => s.id))
    for (const r of runs) {
      const orphaned = r.status === "running" && !r.driving && live !== null && !live.has(r.id)
      const state = orphaned ? "waiting" : TONE_STATE[statusView(r.status, r.driving).tone]
      if (!state) continue
      workers.push({
        id: `run:${r.id}`,
        label: r.title,
        state,
        startedAt: r.startedAt,
        href: `/c/${companyId}/terminal`,
        executorId: r.executorId ?? null,
        roomId: state === "waiting" ? YOUR_DESK : HOT_DESKS,
      })
    }
  }

  return unread.length ? { id: "runs", workers, unreadable: `Can't read ${unread.join(", ")}` } : { id: "runs", workers }
}

/** "HH:MM" strings compare correctly because they are zero-padded (see schedules-impl.ts). */
export function nextSchedule(
  schedules: Schedule[],
  companyId: string,
  nowTime: string
): { schedule: Schedule; tomorrow: boolean } | null {
  const mine = schedules
    .filter((s) => typeof s?.time === "string" && typeof s.commandId === "string" && s.agentId === companyId)
    .sort((a, b) => a.time.localeCompare(b.time))
  if (!mine.length) return null
  const later = mine.find((s) => s.time > nowTime)
  return later ? { schedule: later, tomorrow: false } : { schedule: mine[0], tomorrow: true }
}

function scheduleDesk(input: OfficeInput): { desk: Desk; next: string | null } {
  if (input.schedules instanceof Error) {
    return { desk: { id: "schedule", workers: [], unreadable: "Can't read schedules" }, next: null }
  }
  const found = nextSchedule(input.schedules, input.companyId, localStamp(input.now).time)
  if (!found) return { desk: { id: "schedule", workers: [], note: "Nothing scheduled" }, next: null }
  const next = `${plainCommand(found.schedule.commandId)} ${found.tomorrow ? "tomorrow " : ""}at ${found.schedule.time}`
  const last = input.lastRuns instanceof Error ? undefined : input.lastRuns[scheduleKey(input.companyId, found.schedule.commandId)]
  return {
    desk: { id: "schedule", workers: [], note: last ? `Next: ${next}. Last time: ${last.message}` : `Next: ${next}` },
    next,
  }
}

function summarize(desks: Desk[], next: string | null, problems: string[]): string {
  const all = desks.flatMap((d) => d.workers)
  const count = (state: WorkerState) => all.filter((w) => w.state === state).length
  const parts: string[] = []
  if (count("working")) parts.push(`${count("working")} working`)
  if (count("waiting")) parts.push(`${count("waiting")} waiting on you`)
  if (count("failed")) parts.push(`${count("failed")} stopped`)
  const unreadable = desks.flatMap((d) => (d.unreadable ? [d.unreadable] : []))
  // "Nothing running" is a claim; it can't be made about a source nobody could read.
  if (!parts.length && !unreadable.length) parts.push("Nothing running")
  parts.push(...unreadable, ...problems)
  if (next) parts.push(`next: ${next}`)
  return parts.join(" · ")
}

export function buildOffice(input: OfficeInput): Office {
  const ctx = context(input)
  const schedule = scheduleDesk(input)
  const desks = [terminalDesk(ctx), runsDesk(ctx), schedule.desk]
  const workers = desks.flatMap((d) => d.workers)
  const { rooms, moreRooms } = buildRoomList(ctx.packs, ctx.departments, new Set(workers.map((w) => w.roomId)))
  const residents = residentsFor(
    ctx.companyExecutorId,
    ctx.workspaces.map((w) => w.executorId),
    workers.map((w) => w.executorId)
  )
  const problems = [
    input.packs instanceof Error ? "Can't read teams" : null,
    input.departments instanceof Error ? "Can't read departments" : null,
  ].filter((p): p is string => p !== null)
  return {
    desks,
    rooms,
    moreRooms,
    residents,
    summary: summarize(desks, schedule.next, problems),
    checkedAt: input.now.toISOString(),
  }
}
