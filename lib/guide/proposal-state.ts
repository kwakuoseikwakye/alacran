import { randomUUID } from "node:crypto"
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import path from "node:path"

/**
 * Two small facts about one company's guide proposal, kept in that company's run-data directory beside
 * `first-run.json` (`listPendingReviews` only reads `*.run.json`, so this file cannot be mistaken for a
 * review). Never in the company's own repo, so it can never dirty AGENTS.md.
 *
 * `pending`: the proposal id a page last saw, so the sidebar badge can count it without recomputing.
 * `dismissed`: the one proposal id the owner chose "Not now" for.
 */
export type GuideProposalState = {
  pending?: { id: string; detectedAt: string }
  dismissed?: { id: string; dismissedAt: string }
}

const FILE = "guide-proposal.json"

/** A proposal id is a body hash: a string of exactly 64 lowercase hex characters (not, say, an array that prints as one). */
export const isProposalId = (x: unknown): x is string => typeof x === "string" && /^[0-9a-f]{64}$/.test(x)

function pick(raw: unknown, stamp: "detectedAt" | "dismissedAt"): { id: string; at: string } | undefined {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return undefined
  const record = raw as Record<string, unknown>
  const id = record.id
  const at = record[stamp]
  return isProposalId(id) && typeof at === "string" ? { id, at } : undefined
}

/** A missing, corrupt or wrongly typed file is "nothing recorded", never an error. */
export async function readGuideProposalState(dir: string): Promise<GuideProposalState> {
  try {
    const raw: unknown = JSON.parse(await readFile(path.join(dir, FILE), "utf-8"))
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return {}
    const record = raw as Record<string, unknown>
    const pending = pick(record.pending, "detectedAt")
    const dismissed = pick(record.dismissed, "dismissedAt")
    return {
      ...(pending ? { pending: { id: pending.id, detectedAt: pending.at } } : {}),
      ...(dismissed ? { dismissed: { id: dismissed.id, dismissedAt: dismissed.at } } : {}),
    }
  } catch {
    return {}
  }
}

/** Temp file plus rename, so a reader never sees half a file. */
async function write(dir: string, state: GuideProposalState): Promise<void> {
  await mkdir(dir, { recursive: true })
  const file = path.join(dir, FILE)
  const tmp = `${file}.${randomUUID()}.tmp`
  try {
    await writeFile(tmp, JSON.stringify(state), { encoding: "utf-8", flag: "wx" })
    await rename(tmp, file)
  } finally {
    await rm(tmp, { force: true })
  }
}

// ponytail: read-modify-write with no lock. The writers are a page render and one person's click; a lost
// update costs one extra nudge or a briefly stale badge. Reach for lib/file-lock.ts if a scheduled writer joins.

/** Sets the pending id, or clears it with `null`. Writes only when something changes. */
export async function recordPending(dir: string, id: string | null, now: () => Date = () => new Date()): Promise<void> {
  const state = await readGuideProposalState(dir)
  if (id === null) {
    if (!state.pending) return
    const { pending: _gone, ...rest } = state
    await write(dir, rest)
    return
  }
  if (state.pending?.id === id) return
  await write(dir, { ...state, pending: { id, detectedAt: now().toISOString() } })
}

export async function recordDismissed(dir: string, id: string, now: () => Date = () => new Date()): Promise<void> {
  const state = await readGuideProposalState(dir)
  if (state.dismissed?.id === id) return
  await write(dir, { ...state, dismissed: { id, dismissedAt: now().toISOString() } })
}

export async function clearDismissed(dir: string): Promise<void> {
  const state = await readGuideProposalState(dir)
  if (!state.dismissed) return
  const { dismissed: _gone, ...rest } = state
  await write(dir, rest)
}

export const isDismissed = (state: GuideProposalState, id: string): boolean => state.dismissed?.id === id

/** 1 when a proposal is pending and the owner has not said "Not now" to that exact version. */
export const pendingCountOf = (state: GuideProposalState): 0 | 1 =>
  state.pending && !isDismissed(state, state.pending.id) ? 1 : 0
