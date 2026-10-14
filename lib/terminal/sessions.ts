import { DEFAULT_WORKSPACE_ID } from "./workspace-model"
import os from "node:os"
import type { IPty } from "@homebridge/node-pty-prebuilt-multiarch"
import { createBacklog, type Backlog } from "./backlog"

/**
 * What a tab is running.
 *
 * "ai" is the company's own AI assistant, started already knowing what this
 * company is (see intro-command.ts) — the default, because the audience this
 * app is for does not want a `$` prompt. "shell" is a plain login shell, which
 * is what the terminal was before this and stays one keystroke away. "run" is
 * an unattended agent (lib/agent-runs): read-only, and its output is its log.
 */
export type TerminalKind = "ai" | "shell" | "run"

/** The program a session runs. Argv, never a command line: nothing here is
 *  interpreted by a shell, so nothing has to be quoted for one. */
export type TerminalLaunch = { file: string; args: string[] }

export type TerminalSession = {
  id: string
  agentId: string
  kind: TerminalKind
  /** What the tab says. The executor's own name for an assistant. */
  label: string
  /** Which executor an "ai" tab is running, so a later tab can ask whether
   *  THIS agent has already introduced itself here. Absent on a shell, which
   *  runs no agent and introduces nothing. */
  executorId?: string
  /** The terminal workspace this tab belongs to (`workspaces.ts`). Absent for
   *  runs and for anything opened before workspaces existed, which the page
   *  files under Main. Lives and dies with the process, like the session. */
  workspaceId?: string
  startedAt: number
  pty: IPty
  /** Everything written so far, capped. Replayed to a client that (re)attaches
   *  so a reload — or switching to another tab and back — doesn't show an
   *  empty screen for a live session. */
  backlog: Backlog
  listeners: Set<(chunk: string) => void>
}

/**
 * Sessions keyed by company AND session id, so one company can hold several.
 *
 * The key is joined with NUL because neither half can contain one: an agent id
 * comes from the registry and a session id is validated against
 * `isValidSessionId` before it ever reaches here, so no pair of ids can collide
 * into one key.
 */
const sessions = new Map<string, TerminalSession>()

const key = (agentId: string, sessionId: string) => `${agentId}\u0000${sessionId}`

export type CompanyEvent = { type: "added"; session: TerminalSession } | { type: "removed"; id: string }

/**
 * Who wants to hear about this company's sessions coming and going — the one
 * multiplexed stream per open page (company-stream.ts), so a tab opened after
 * the page connected still reaches it without a second EventSource.
 */
const companyListeners = new Map<string, Set<(event: CompanyEvent) => void>>()

export function subscribeCompany(agentId: string, listener: (event: CompanyEvent) => void): () => void {
  let set = companyListeners.get(agentId)
  if (!set) companyListeners.set(agentId, (set = new Set()))
  set.add(listener)
  return () => {
    set.delete(listener)
    if (set.size === 0) companyListeners.delete(agentId)
  }
}

function emit(agentId: string, event: CompanyEvent) {
  for (const listener of companyListeners.get(agentId) ?? []) listener(event)
}

/**
 * A ceiling, because the id comes from the client. Every open spawns a real
 * process, so without this a page in a loop is a fork bomb with a REST API.
 * Eight is well past what anyone has tabs for and far short of what hurts.
 *
 * Per WORKSPACE, not per company: each workspace is its own set of terminals
 * and gets its own eight. A company is still bounded, by the workspace limit
 * (`MAX_WORKSPACES_PER_COMPANY`) times this.
 */
export const MAX_SESSIONS_PER_WORKSPACE = 8

/** Enough to redraw a full-screen TUI after a reload, not enough to grow
 *  unbounded on a chatty process. */
export const MAX_BACKLOG = 200_000

/** Ids are used as map keys and echoed back in listings, so they are checked
 *  rather than trusted — the client picks them. */
export function isValidSessionId(id: string): boolean {
  return /^[A-Za-z0-9_-]{1,64}$/.test(id)
}

/**
 * Whether an in-app terminal can run at all on this machine.
 *
 * `@homebridge/node-pty-prebuilt-multiarch` ships prebuilt binaries per
 * platform/arch **and per Node ABI**, and resolves them at require time. There
 * is no prebuild for Node 18 (ABI 108) — which is exactly what Ubuntu 24.04's
 * own `nodejs` package is — so on that machine the require throws
 * MODULE_NOT_FOUND and everything else in the app keeps working.
 *
 * So the capability is a try/catch around the import, not a version check: the
 * question is "did the binary load", and the only honest way to answer it is to
 * try. Cached because the answer cannot change while the process lives.
 */
let ptyModule: typeof import("@homebridge/node-pty-prebuilt-multiarch") | null | undefined

async function loadPty() {
  if (ptyModule !== undefined) return ptyModule
  try {
    ptyModule = await import("@homebridge/node-pty-prebuilt-multiarch")
  } catch {
    ptyModule = null
  }
  return ptyModule
}

export async function terminalAvailable(): Promise<boolean> {
  return (await loadPty()) !== null
}

export function getSession(agentId: string, sessionId: string): TerminalSession | undefined {
  return sessions.get(key(agentId, sessionId))
}

export type SessionSummary = { id: string; kind: TerminalKind; label: string; startedAt: number; workspaceId?: string; executorId?: string }

/**
 * This company's live sessions, oldest first.
 *
 * This is what lets a reload come back to the same tabs instead of a fresh
 * shell: the ptys outlive the page, so the page asks what is already running
 * rather than remembering.
 */
export function listSessions(agentId: string): SessionSummary[] {
  return [...sessions.values()]
    .filter((s) => s.agentId === agentId)
    .sort((a, b) => a.startedAt - b.startedAt)
    .map(({ id, kind, label, startedAt, workspaceId, executorId }) => ({ id, kind, label, startedAt, workspaceId, executorId }))
}

/** How many live terminals one workspace holds. A session that names none — a
 *  run, a take-over, anything from before workspaces — counts under Main. */
export function countSessions(agentId: string, workspaceId: string = DEFAULT_WORKSPACE_ID): number {
  return listSessions(agentId).filter((s) => (s.workspaceId ?? DEFAULT_WORKSPACE_ID) === workspaceId).length
}

/**
 * Has an assistant running this executor already introduced itself in this
 * company — i.e. is one of its tabs still open?
 *
 * Keyed on the PAIR, because a company moves between agents: the executor is a
 * per-company setting (`ai-executor-registry.ts`) the user can change from the
 * picker at any time, and a Kiro tab opened after three Claude ones has never
 * said hello here. Keying on company alone would hand that first Kiro tab a
 * silent session that knows nothing about the company it is standing in.
 *
 * Live sessions ARE the record, deliberately — no file, nothing to keep in
 * sync. Close every assistant tab and the next one introduces itself again,
 * which is the right answer rather than a gap: an empty terminal page and a
 * fresh tab is a new sitting, and it is the only moment a stale
 * docs/company-summary.md gets rewritten.
 */
export function hasLiveAssistant(agentId: string, executorId: string): boolean {
  for (const session of sessions.values()) {
    if (session.agentId === agentId && session.kind === "ai" && session.executorId === executorId) return true
  }
  return false
}

export type CompanyTerminalStatus = {
  running: boolean
  hasAiAgent: boolean
  count: number
  labels: string[]
}

/**
 * Live terminal status for an agent / company.
 *
 * Checks in-memory active terminal sessions for this agent.
 * An AI agent is running if any session has kind "ai".
 */
export function getCompanyTerminalStatus(agentId: string): CompanyTerminalStatus {
  const agentSessions = listSessions(agentId)
  const aiSessions = agentSessions.filter((s) => s.kind === "ai")
  return {
    running: agentSessions.length > 0,
    hasAiAgent: aiSessions.length > 0,
    count: agentSessions.length,
    labels: agentSessions.map((s) => s.label),
  }
}

/**
 * Live terminal status across all companies with active terminal sessions.
 */
export function getAllCompaniesTerminalStatus(): Record<string, CompanyTerminalStatus> {
  const result: Record<string, CompanyTerminalStatus> = {}
  for (const session of sessions.values()) {
    if (!result[session.agentId]) {
      result[session.agentId] = {
        running: true,
        hasAiAgent: false,
        count: 0,
        labels: [],
      }
    }
    result[session.agentId].count++
    result[session.agentId].labels.push(session.label)
    if (session.kind === "ai") {
      result[session.agentId].hasAiAgent = true
    }
  }
  return result
}

/** Test-only: reset in-memory sessions map */
export function _clearSessionsForTest(): void {
  sessions.clear()
  companyListeners.clear()
}

/** Test-only: insert a fake session */
export function _setSessionForTest(session: TerminalSession): void {
  sessions.set(key(session.agentId, session.id), session)
}

function defaultShellLaunch(): TerminalLaunch {
  const shell = process.env.SHELL || (process.platform === "darwin" ? "/bin/zsh" : "/bin/bash")
  return { file: shell, args: ["-l"] }
}

/**
 * Attach to one of this company's terminals, starting it if it isn't running.
 *
 * The launch is argv handed straight to the pty — the assistant runs AS the
 * session's own process rather than being typed into a shell. That is what
 * keeps a ~1.4KB opening prompt off the screen: a shell echoes what it is
 * given, and v97 is the slice that exists because a prompt that size redraws
 * over itself and reads as corruption. Here nothing echoes it, because nothing
 * types it.
 */
export async function openSession(options: {
  agentId: string
  sessionId: string
  cwd: string
  kind?: TerminalKind
  label?: string
  executorId?: string
  workspaceId?: string
  launch?: TerminalLaunch
  /** Called once the program has exited and the session is gone — Take over
   *  commits the person's edits here. */
  onExit?: () => void
  cols?: number
  rows?: number
}): Promise<TerminalSession | null> {
  const { agentId, sessionId, cwd, kind = "shell", label = "Command line", executorId, workspaceId, cols = 80, rows = 24 } = options

  const existing = sessions.get(key(agentId, sessionId))
  if (existing) return existing
  if (countSessions(agentId, workspaceId) >= MAX_SESSIONS_PER_WORKSPACE) return null

  const pty = await loadPty()
  if (!pty) return null

  const launch = options.launch ?? defaultShellLaunch()
  let child: IPty
  try {
    child = pty.spawn(launch.file, launch.args, {
      name: "xterm-256color",
      cols,
      rows,
      cwd,
      env: {
        ...process.env,
        // Without this an interactive program sees the packaged app's own TERM
        // (often unset) and draws in the dumbest mode it has.
        TERM: "xterm-256color",
        HOME: process.env.HOME ?? os.homedir(),
      },
    })
  } catch {
    // A binary that cannot be started at all. The caller turns this into a
    // sentence; it must never take the server down.
    return null
  }

  const session: TerminalSession = {
    id: sessionId,
    agentId,
    kind,
    label,
    executorId,
    workspaceId,
    startedAt: Date.now(),
    pty: child,
    backlog: createBacklog(MAX_BACKLOG),
    listeners: new Set(),
  }
  sessions.set(key(agentId, sessionId), session)

  child.onData((chunk) => {
    session.backlog.push(chunk)
    for (const listener of session.listeners) listener(chunk)
  })
  child.onExit(() => {
    // A program that exits should not leave a dead session behind that the next
    // attach silently reuses — the user would type into nothing.
    sessions.delete(key(agentId, sessionId))
    for (const listener of session.listeners) listener("\r\n\x1b[2m[session ended]\x1b[0m\r\n")
    // After the last line has gone out, so a stream flushes it rather than drops it.
    emit(agentId, { type: "removed", id: sessionId })
    session.listeners.clear()
    options.onExit?.()
  })

  emit(agentId, { type: "added", session })

  return session
}

/**
 * Add a session this module did not spawn — an unattended agent run, whose
 * "pty" is a tail of its log (lib/agent-runs/run-engine.ts). Same map, same
 * stream, same listing, so a run is a tab like any other and rides the same
 * flow control. The caller has already checked the per-company cap.
 */
export function registerSession(session: TerminalSession): void {
  sessions.set(key(session.agentId, session.id), session)
  emit(session.agentId, { type: "added", session })
}

/**
 * How many open streams are too far behind to take more of a session's output
 * (company-stream.ts). While any is, the pty is paused, so the program blocks on
 * its next write, exactly as it would behind a slow real terminal. Without this
 * a flooding program (a build, `yes`, a huge `cat`) fills the one stream a page
 * has faster than the browser drains it, and a keystroke's echo in the NEXT
 * pane waits behind megabytes of someone else's output. Counted, because two
 * open windows can each fall behind.
 */
const holds = new WeakMap<TerminalSession, number>()

export function holdOutput(session: TerminalSession): void {
  const count = holds.get(session) ?? 0
  holds.set(session, count + 1)
  if (count > 0) return
  try {
    session.pty.pause()
  } catch {
    // A pty that already exited has nothing to pause.
  }
}

export function releaseOutput(session: TerminalSession): void {
  const count = holds.get(session) ?? 0
  if (count === 0) return
  holds.set(session, count - 1)
  if (count > 1) return
  try {
    session.pty.resume()
  } catch {
    // Gone; nothing to resume.
  }
}

export function closeSession(agentId: string, sessionId: string): void {
  const session = sessions.get(key(agentId, sessionId))
  if (!session) return
  sessions.delete(key(agentId, sessionId))
  emit(agentId, { type: "removed", id: sessionId })
  try {
    session.pty.kill()
  } catch {
    // Already gone. Nothing to do, and nothing worth failing a request over.
  }
}
