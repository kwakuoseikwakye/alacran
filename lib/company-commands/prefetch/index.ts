import { buildRepoStatusPrefetch } from "./repo-status"
import { buildTriageEmailPrefetch } from "./triage-email"
import { buildTriageIssuePrefetch } from "./triage-issue"
import { buildCheckNotionPrefetch } from "./check-notion"
import type { PrefetchContext, PrefetchKind, PrefetchResult } from "./types"

export type { PrefetchKind, PrefetchContext, PrefetchResult, PrefetchExecFileFn, PrefetchFetchFn } from "./types"

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
    case "triage-issue":
      return buildTriageIssuePrefetch(ctx)
    case "check-notion":
      return buildCheckNotionPrefetch(ctx)
    default:
      // This stays a real runtime guard even now that every named PrefetchKind
      // has a handler — a registry entry can still name a kind with no handler.
      return { ok: false, message: `No prefetch handler for kind: ${kind}` }
  }
}
