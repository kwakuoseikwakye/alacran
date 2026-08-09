export type PrefetchKind = "repo-status" | "triage-email" | "triage-issue" | "check-notion"

export type PrefetchExecFileFn = (
  file: string,
  args: string[],
  options: { cwd: string }
) => Promise<{ stdout: string; stderr: string }>

/** Minimal shape check-notion needs from a fetch call — real enough to inject
 *  a fake in tests without pulling in a full Response mock. */
export type PrefetchFetchFn = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string }
) => Promise<{ status: number; ok: boolean; json: () => Promise<unknown> }>

export type PrefetchContext = {
  /** The company repo. Prefetch may read outside it; the spawned agent may not. */
  agentRootPath: string
  fieldValues: Record<string, string>
  execFn: PrefetchExecFileFn
  /**
   * Injectable file reader for the YAML config the triage prefetches need.
   * Optional: the dispatcher's callers leave it unset and the readers fall back
   * to real fs. Declared here rather than added later so tests never need a cast.
   */
  readFileFn?: (filePath: string) => Promise<string>
  /**
   * The company's assigned Google account(s) (lib/google-accounts-config.ts),
   * or ["auto"] when unassigned. Optional so every existing ctx() fixture
   * keeps working unchanged — only triage-email's handler reads it, and
   * defaults to ["auto"] itself when absent.
   */
  accounts?: string[]
  /**
   * Injectable network call for check-notion (the only prefetch that talks to
   * a real external API rather than shelling out to a CLI — Notion has none
   * to shell out to). Same optional/falls-back-to-real convention as
   * readFileFn: unset in every existing caller, so no other prefetch or its
   * tests need to change.
   */
  fetchFn?: PrefetchFetchFn
}

/**
 * Prefetch can refuse. A refusal aborts the run before any agent spawns, so a
 * doomed run never costs an API call — this is why the result is a union rather
 * than a plain string.
 */
export type PrefetchResult = { ok: true; text: string } | { ok: false; message: string }
