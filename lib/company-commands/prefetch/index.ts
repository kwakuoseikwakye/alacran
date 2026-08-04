import { buildRepoStatusPrefetch } from "./repo-status"
import { buildTriageEmailPrefetch } from "./triage-email"
import type { PrefetchContext, PrefetchKind, PrefetchResult } from "./types"

export type { PrefetchKind, PrefetchContext, PrefetchResult, PrefetchExecFileFn } from "./types"

export async function runPrefetch(
  kind: PrefetchKind | undefined,
  ctx: PrefetchContext
): Promise<PrefetchResult> {
  switch (kind) {
    case undefined:
      return { ok: true, text: "" }
    case "repo-status":
      return buildRepoStatusPrefetch(ctx)
    case "triage-email":
      return buildTriageEmailPrefetch(ctx)
    default:
      // Tasks 4 and 5 add the two triage cases. Do NOT write a `never`
      // exhaustiveness assertion here: `PrefetchKind` already names those kinds,
      // so at this point in the plan they are genuinely reachable and the
      // assertion would not compile. Even once every kind is handled this stays
      // a real runtime guard — a registry entry can name a kind with no handler.
      return { ok: false, message: `No prefetch handler for kind: ${kind}` }
  }
}
