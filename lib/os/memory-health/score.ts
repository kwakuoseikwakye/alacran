import type { SourcesState } from "./types"

/** Separate from the Diagnostics score on purpose: different question, different weights. */
export function scoreMemoryHealth(input: { stale: unknown[]; unfinished: unknown[]; sources: SourcesState }): number {
  const stale = Math.min(50, 10 * input.stale.length)
  const unfinished = Math.min(20, 10 * input.unfinished.length)
  const { sources } = input
  const total = sources.state === "tracked" ? sources.sourced + sources.unsourced : 0
  const unsourced = sources.state === "tracked" && total > 0 ? Math.round((30 * sources.unsourced) / total) : 0
  return Math.max(0, 100 - stale - unfinished - unsourced)
}
