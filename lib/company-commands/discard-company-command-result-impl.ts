import { readFile, readdir, unlink, writeFile, realpath } from "node:fs/promises"
import path from "node:path"
import { getEffectiveAgents } from "../get-effective-agents"
import { resolveWithinAgentRoot } from "../path-guard"
import { listChangedPaths, splitRunChanges, defaultCwdExecFile, type ExecFileFn } from "./repo-changes"
import { pendingClaimedPaths } from "./pending-claims"
import { dropOwnedLocked, FAILED_TO_DROP } from "./discard-owned-changes-impl"
import { getCompanyCommand } from "./registry"
import { lockReview } from "./review-lock"
import { checkRunLockStatus } from "./run-lock"
import type { CompanyCommandOutputKind } from "./types"
import { COMPANY_COMMANDS_DATA_DIR } from "./paths"

export type DiscardCompanyCommandResult = { discarded: boolean; message: string }

type RunRecord = {
  outputKind: "new-file-in-dir" | "known-file"
  outputPath: string
  before: string[] | string | null
  /** Absent on records written before strays were tracked. */
  beforeDirty?: string[] | null
  ownedBaseline?: string[] | null
}

/**
 * Throw away a result instead of keeping it.
 *
 * There was no way to say no. Cancel on the confirm dialog left the run record
 * in place, so the item stayed pending forever and the sidebar dot never
 * cleared — on an app whose entire safety story is that a human approves every
 * gated action. A gate you can only ever agree with is not a gate; it teaches
 * people to approve without reading, which is worse than no gate at all.
 *
 * The undo is the `before` snapshot the runner already takes, so this needs no
 * new bookkeeping: a `known-file` goes back to the text it held (or is deleted
 * if it did not exist), and a `new-file-in-dir` loses exactly the names that
 * were not there before. Never git — the result being discarded is uncommitted
 * by definition, and `git checkout` would also throw away anything else the
 * user had in flight in that file.
 *
 * Containment is the commit path's, deliberately unchanged: the same
 * cheap-then-realpath pair, because a run record is a file on disk and a
 * tampered one must not turn "discard" into "delete anything you name".
 *
 * REFUSES when the run also touched files outside its output path. `beforeDirty`
 * records names, not contents, so a stray edit cannot be put back — only
 * reported. Undoing the output alone and answering "Discarded" would be the app
 * claiming an undo it did not perform, which is the same dishonesty as a gate
 * you can only agree with. Better to say so and let a human decide (the review
 * lists them; the message itself stays a plain sentence with no file names).
 *
 * Owned files (a command's `alsoWrites` lanes, v234) are not strays: they are
 * dropped first, with the same checks as "drop fact changes" (including the
 * optional `expectedOwned` the owner was shown), and only then is the output
 * undone. If the drop cannot finish, nothing else is touched.
 */
export async function discardCompanyCommandResultImpl(
  commandId: string,
  agentId: string,
  dataDir: string = path.join(COMPANY_COMMANDS_DATA_DIR, agentId),
  execFn: ExecFileFn = defaultCwdExecFile,
  expectedOwned?: { path: string; newText: string }[],
  afterDiscard?: (dataDir: string, info: { commandId: string; outputKind: CompanyCommandOutputKind }) => Promise<void>
): Promise<DiscardCompanyCommandResult> {
  const command = getCompanyCommand(commandId)
  if (!command) return { discarded: false, message: `Unknown command "${commandId}"` }

  if ((await checkRunLockStatus(dataDir)).running) return { discarded: false, message: "Changes are still being prepared. Wait until the work finishes, then review again." }

  const agents = await getEffectiveAgents()
  const agent = agents.find((a) => a.id === agentId)
  if (!agent) return { discarded: false, message: `Unknown company "${agentId}"` }

  const releaseReview = await lockReview(dataDir, commandId)
  if (!releaseReview) return { discarded: false, message: "Changes are still being prepared. Review again when the work finishes." }
  try {
    const recordPath = path.join(dataDir, `${commandId}.run.json`)
    let record: RunRecord
    try {
      record = JSON.parse(await readFile(recordPath, "utf-8"))
    } catch {
      return { discarded: false, message: "There's nothing waiting to be discarded." }
    }

    // The record names its own output path; the command says where that command
    // is allowed to write. They must agree before anything is deleted.
    if (record.outputPath !== command.outputPath) {
      return { discarded: false, message: `Refusing to discard a path outside "${command.id}"'s expected output location` }
    }

    let expectedRoot: string
    try {
      expectedRoot = await realpath(agent.rootPath)
    } catch {
      return { discarded: false, message: "Couldn't find this company's folder, so nothing was undone." }
    }

    const targetAbs = path.join(agent.rootPath, record.outputPath)
    const guard = await resolveWithinAgentRoot(targetAbs)
    // A known-file run may have CREATED the file, so a path that does not resolve
    // is only fatal when something is supposed to be restored into it.
    if (guard && guard.agentRootPath !== expectedRoot) {
      return { discarded: false, message: "Refusing to discard a path outside the configured agent root" }
    }

    // Null means "could not be established" (no git, pre-strays record) and must
    // not read as "none" — the same distinction computeStrays keeps. An unknown
    // answer is not a reason to refuse, only a reason not to claim safety.
    let owned: string[] = []
    if (record.beforeDirty) {
      let strays: string[] | null = null
      try {
        const split = splitRunChanges(
          { ...record, beforeDirty: record.beforeDirty },
          command,
          await listChangedPaths(agent.rootPath, execFn),
          await pendingClaimedPaths(dataDir, command.id)
        )
        strays = split.strays
        owned = split.owned
      } catch {
        strays = null
      }
      if (strays && strays.length > 0) {
        return {
          discarded: false,
          message: "This run also changed other files, which Discard can't put back. Nothing was undone. Review those files yourself first.",
        }
      }
    }

    // Owned changes go first, under this same lock, so a refusal or failure leaves the output untouched.
    if (owned.length > 0) {
      const dropped = await dropOwnedLocked(command, expectedRoot, record, dataDir, (file, args) => execFn(file, args, { cwd: expectedRoot }), expectedOwned, true)
        .catch(() => ({ discarded: false, message: FAILED_TO_DROP, partial: undefined }))
      if (!dropped.discarded || dropped.partial) return { discarded: false, message: dropped.message }
    }

    try {
      if (record.outputKind === "new-file-in-dir") {
        const before = Array.isArray(record.before) ? record.before : []
        const current = await readdir(targetAbs).catch(() => [] as string[])
        for (const name of current) {
          if (!before.includes(name)) await unlink(path.join(targetAbs, name)).catch(() => {})
        }
      } else if (typeof record.before === "string") {
        await writeFile(targetAbs, record.before, "utf-8")
      } else {
        await unlink(targetAbs).catch(() => {})
      }
    } catch {
      return { discarded: false, message: "Couldn't finish putting the files back. Check them before trying again." }
    }

    // Last, and only once the files are actually back: the record is what makes
    // this findable at all, so removing it before the restore would strand a
    // half-undone change with nothing pointing at it.
    await unlink(recordPath).catch(() => {})
    try {
      await afterDiscard?.(dataDir, { commandId: command.id, outputKind: command.outputKind })
    } catch {
      // A log line that could not be written must not turn a finished discard into a reported failure.
    }
    return { discarded: true, message: "Discarded" }
  } finally { await releaseReview().catch(() => {}) }
}
