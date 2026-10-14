import { execFile as nodeExecFile } from "node:child_process"
import { promisify } from "node:util"
import type { ExecFileFn } from "./terminal-launch-command"

const execFileAsync = promisify(nodeExecFile)

/**
 * The real `execFile` behind every injectable `ExecFileFn` seam in this repo.
 *
 * Sixteen `-impl.ts` files each carried a byte-identical copy of this, with its
 * own `node:child_process` and `node:util` imports for it — the same shape v78
 * consolidated `pathExists` out of, regrown around a different function. The
 * seam itself stays exactly what it was: every caller still takes an
 * `execFn: ExecFileFn = defaultExecFile` parameter, and every test still
 * injects its own, so nothing here touches a real process from a test.
 *
 * **Deliberately NOT the memoized one.** `lib/exec-memo.ts` exists for probes
 * that re-run on every render, and v75's rule is that a memo belongs to the
 * module whose default it is — `google-accounts.ts` and
 * `connect/connect-status-impl.ts` keep their own memoized defaults, because a
 * shared memoized exec would silently no-op the second click on any path whose
 * whole job is to look again.
 *
 * The three variants that are not this — a `{ cwd }` argument
 * (`run-verify-impl`, `run-company-command-impl`) and a long timeout
 * (`install-tool-impl`) — keep their own, since they differ in what they pass,
 * not in how they're written.
 */
export const defaultExecFile: ExecFileFn = (command, args) => execFileAsync(command, args)
