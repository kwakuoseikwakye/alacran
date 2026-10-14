import { buildHandoffPrefetch } from "./handoff"
import { buildInboxPrefetch } from "./inbox"
import { buildMessagesPrefetch } from "./messages"
import { buildPreferencesPrefetch } from "./preferences"
import { buildRefreshPrefetch } from "./refresh"
import type { PrefetchContext, PrefetchKind, PrefetchResult } from "./types"

export type { PrefetchKind, PrefetchContext, PrefetchResult, PrefetchExecFileFn, PrefetchFetchFn } from "./types"

export async function runPrefetch(
  kind: PrefetchKind | undefined,
  ctx: PrefetchContext
): Promise<PrefetchResult> {
  switch (kind) {
    case undefined:
      return { ok: true, text: "" }
    case "refresh":
      return buildRefreshPrefetch(ctx)
    case "messages":
      return buildMessagesPrefetch(ctx)
    case "inbox":
      return buildInboxPrefetch(ctx)
    case "handoff":
      return buildHandoffPrefetch(ctx)
    case "preferences":
      return buildPreferencesPrefetch(ctx)
    default:
      // This stays a real runtime guard even now that every named PrefetchKind
      // has a handler — a registry entry can still name a kind with no handler.
      return { ok: false, message: `No prefetch handler for kind: ${kind}` }
  }
}
