import type { PrefetchKind } from "./prefetch/types"

export type CompanyCommandField = {
  key: string
  label: string
  required: boolean
  multiline: boolean
  placeholder?: string
}

export type CompanyCommandOutputKind = "new-file-in-dir" | "known-file"

export type CompanyCommand = {
  id: string
  commandFileName: string
  label: string
  description?: string
  fields: CompanyCommandField[]
  outputKind: CompanyCommandOutputKind
  outputPath: string
  prefetchKind?: PrefetchKind
  /**
   * No command declares this today (v99 cut the gog-backed jobs). It stays
   * because it is how a command gets a NARROW Bash allowlist instead of the
   * blanket `--disallowedTools Bash` every command now gets.
   */
  bashPatterns?: string[]
  /**
   * Exact MCP tool names this job may call, e.g. Canva's design tools. Added to
   * the executor's allowlist and nothing else — a job without it gets no MCP
   * access at all. Only executors with `supportsMcpToolAllowlist` can honour
   * it, and runCompanyCommandImpl refuses the job everywhere else.
   */
  mcpTools?: string[]
  /**
   * Summarising upkeep (a digest) rather than judgement: runs on the
   * executor's routineModelArgs, its cheapest model, where it has one.
   */
  routine?: boolean
  /**
   * This command's prompt carries text written by someone outside the
   * company — an email body, a Notion page, an issue. Set it on any command
   * whose prefetch (or whose own allowlisted reads) pull in external
   * content, NOT on commands whose prompt is only what the user typed plus
   * the company's own repo.
   *
   * Consequence: runCompanyCommandImpl refuses to run the command at all on
   * an AI executor whose `enforcesToolScope` is false. The tool allowlist is
   * the layer that's supposed to hold when a prompt-injection payload gets
   * past the fence (see prefetch/untrusted-fence.ts); three of the four
   * registered executors have no allowlist to give, so pairing them with
   * untrusted input means running attacker-influenced text through an agent
   * with auto-approve on and no edit scope. Refusing is the only honest
   * option — there is no flag to synthesise the missing sandbox.
   */
  untrustedInput?: true
  /**
   * Append the owner's approved preferences (definitions/preferences.md) to this command's prompt.
   * Drafting commands only; never the fact pipeline or learn-preferences itself.
   */
  usesPreferences?: true
  /**
   * This command's prompt only means anything to an agent that is ALREADY in
   * the middle of a session with the user — it asks about work the agent did,
   * not about the repo.
   *
   * Consequence, and the reason this is a field rather than an id check in one
   * place: such a command must never be spawned headlessly. A fresh
   * `claude -p` has no session to describe, so it would either write an empty
   * note or invent a plausible one, and an invented memory is worse than no
   * memory — it is the one failure this app's whole moat cannot survive.
   * `isSchedulableCommand` returns false for it (a 07:00 unattended run is
   * exactly the "nobody was there" case), and `runCompanyCommandImpl` refuses
   * it outright. It reaches an agent only by being typed into a live session —
   * see lib/terminal/save-session-note-impl.ts.
   */
  requiresLiveSession?: true
  /**
   * Paths this command may change besides `outputPath`: an exact file, or a directory written with a
   * trailing "/". The review shows them, commits them with the output, and can drop them; they are
   * never reported as stray. Absent means today's behaviour exactly. See repo-changes.ts.
   */
  alsoWrites?: string[]
  /**
   * Started only by a button in a review, never from a schedule or the Skills tree.
   * `isSchedulableCommand` returns false for it.
   */
  manualOnly?: true
  /** A line appended to the commit message when this run is approved, e.g. "Applied facts from: …". */
  commitTrailer?: (fieldValues: Record<string, string>) => string
  buildPrompt: (fieldValues: Record<string, string>, today: string, prefetch: string) => string
}

export type CompanyCommandDefinition = Omit<CompanyCommand, "buildPrompt"> & {
  buildPrompt: (args?: Record<string, unknown>, today?: string, prefetch?: string) => string
}
