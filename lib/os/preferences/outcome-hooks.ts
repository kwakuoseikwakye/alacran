import { markFirstSaved } from "@/lib/os/first-run-state"
import { recordOutcome, type OutcomeKind } from "./outcomes"

export type OutcomeInfo = { commandId: string; outputKind: OutcomeKind }

/** What a person pressing Approve (or Approve All) leaves behind: a log line, then the first-run marker. */
export async function afterApproval(dataDir: string, info: OutcomeInfo): Promise<void> {
  await recordOutcome(dataDir, { command: info.commandId, outcome: "approved", kind: info.outputKind, files: 1 })
  await markFirstSaved(dataDir)
}

export async function afterDiscard(dataDir: string, info: OutcomeInfo): Promise<void> {
  await recordOutcome(dataDir, { command: info.commandId, outcome: "discarded", kind: info.outputKind, files: 1 })
}
