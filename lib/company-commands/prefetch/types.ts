export type PrefetchKind = "refresh" | "messages" | "inbox" | "handoff" | "preferences"

export type PrefetchExecFileFn = (
  file: string,
  args: string[],
  options: { cwd: string }
) => Promise<{ stdout: string; stderr: string }>

/** Minimal shape the Notion fetch needs — real enough to inject a fake in
 *  tests without pulling in a full Response mock. */
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
   * Injectable file reader for the company-local files a prefetch reads (the
   * Notion token today). Optional: the dispatcher's callers leave it unset and
   * the readers fall back to real fs, so tests never need a cast.
   */
  readFileFn?: (filePath: string) => Promise<string>
  /**
   * Injectable network call for the Notion half of `refresh` (the only
   * prefetch that talks to a real external API rather than shelling out to a
   * CLI — Notion has none to shell out to). Same optional/falls-back-to-real
   * convention as readFileFn.
   */
  fetchFn?: PrefetchFetchFn
  /** The company's run-data directory (where outcomes.jsonl lives). Set by runCompanyCommandImpl; only the `preferences` prefetch reads it. */
  dataDir?: string
}

/**
 * Prefetch can refuse. A refusal aborts the run before any agent spawns, so a
 * doomed run never costs an API call — this is why the result is a union rather
 * than a plain string.
 */
export type PrefetchResult =
  | { ok: true; text: string; /** Called once the run is actually about to spawn (never on a refusal). */ onRunStart?: () => Promise<void> }
  | { ok: false; message: string }
