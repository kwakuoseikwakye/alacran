import type { AiExecutorId } from "@/lib/ai-executors"

/**
 * The office's shape, shared by the route and the browser. Nothing here may
 * import node modules: the Home card imports this file.
 */
export type WorkerState = "working" | "waiting" | "failed"

export type Worker = {
  id: string
  label: string
  state: WorkerState
  /** ISO time it started, when the source records one. */
  startedAt: string | null
  href: string | null
  /** The AI doing it, when known. */
  executorId: string | null
  /** Where it happens: a Room id, HOT_DESKS or YOUR_DESK. */
  roomId: string
}

export type DeskId = "terminal" | "runs" | "schedule"

export type Desk = {
  id: DeskId
  workers: Worker[]
  /** The Schedule desk's line: what's next and how it went last time. */
  note?: string
  /** Set when this desk's source could not be read. The desk must say so, never look idle. */
  unreadable?: string
}

export type Office = {
  desks: Desk[]
  rooms: Room[]
  /** Rooms left out beyond the cap. */
  moreRooms: number
  residents: Resident[]
  summary: string
  checkedAt: string
}

export const DESK_NAMES: Record<DeskId, string> = { terminal: "Terminal", runs: "Runs", schedule: "Schedule" }

export const STATE_WORDS: Record<WorkerState, string> = {
  working: "Working",
  waiting: "Waiting on you",
  failed: "Stopped",
}

const POLL_MS = 4_000
const MAX_POLL_MS = 30_000

/** 4 s normally; after failures 8, 16, then 30 s at most. */
export function nextPollDelay(failures: number): number {
  return Math.min(POLL_MS * 2 ** failures, MAX_POLL_MS)
}

/** The line under the picture. It never sits on "Looking…" once an answer has failed to come. */
export function statusLine(office: Office | null, failing: boolean, now: number): string {
  if (!office) return failing ? "Couldn't load who's working" : "Looking…"
  if (!failing) return office.summary
  const seconds = Math.max(0, Math.round((now - Date.parse(office.checkedAt)) / 1000))
  return `${office.summary} · Couldn't update · last checked ${seconds}s ago`
}

const DRAG_TOLERANCE_PX = 4

/** True when the pointer moved enough between press and release that the gesture was a drag. */
export function wasDrag(down: { x: number; y: number } | null, up: { x: number; y: number }): boolean {
  return down !== null && Math.hypot(up.x - down.x, up.y - down.y) > DRAG_TOLERANCE_PX
}

export type RoomKind = "hq" | "team" | "department"

/** A walled room in the office: HQ, an installed starter-pack team, or a department. */
export type Room = { id: string; kind: RoomKind; name: string; color: string; glyph: string }

/** One person in the office per AI this company uses. */
export type Resident = { executorId: string; name: string; color: string }

/** Shared zones a worker can be in when it has no room of its own. */
export const HOT_DESKS = "hot-desks"
export const YOUR_DESK = "your-desk"

const RESIDENT_LOOKS: Record<AiExecutorId, { name: string; color: string }> = {
  "claude-code": { name: "Claude", color: "#d9774f" },
  codex: { name: "Codex", color: "#f1f1ee" },
  kimi: { name: "Kimi", color: "#6d5ef5" },
  kiro: { name: "Kiro", color: "#9b5cff" },
  "google-antigravity": { name: "Antigravity", color: "#4285f4" },
}

/** The short name and shirt colour an AI wears in the office. */
export function residentLook(executorId: string): { name: string; color: string } {
  return Object.hasOwn(RESIDENT_LOOKS, executorId)
    ? RESIDENT_LOOKS[executorId as AiExecutorId]
    : { name: executorId, color: "#94a3b8" }
}
