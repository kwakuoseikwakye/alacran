import { getCompanyCommandResultImpl } from "@/lib/company-commands/company-command-result-impl"
import type { ExecFileFn } from "@/lib/company-commands/repo-changes"

/**
 * True while a learn-preferences proposal sits unapproved in Approvals: the run record exists AND the
 * run actually changed the file (a run that changed nothing leaves a record but nothing to review).
 * The proposal lives in the working tree, so anything that must only see approved lines checks this.
 */
export async function hasPendingPreferenceReview(dataDir: string, root: string, execFn?: ExecFileFn): Promise<boolean> {
  try {
    return (await getCompanyCommandResultImpl("learn-preferences", dataDir, root, execFn, false)).changed
  } catch {
    return false
  }
}
