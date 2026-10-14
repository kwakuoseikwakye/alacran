export type StaleSection = { key: string; label: string; ageDays: number; newerNotes: number; newerDecisions: number }
/** `where` is a section label, or a file's plain name. */
export type UnfinishedItem = { where: string; line: number }
export type SourcesState =
  /** No sourced change has ever been made: a feature not used yet, not a failure. */
  | { state: "not-tracked" }
  | { state: "tracked"; sourced: number; unsourced: number }
export type MemoryHealth =
  /** No company profile at HEAD: nothing to check. */
  | { state: "none" }
  /** Git could not be read. Never shown as a score. */
  | { state: "unknown" }
  | { state: "ok"; score: number; checkedAt: string; stale: StaleSection[]; unfinished: UnfinishedItem[]; sources: SourcesState }
