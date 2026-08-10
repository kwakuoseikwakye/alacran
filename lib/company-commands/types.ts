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
  fields: CompanyCommandField[]
  outputKind: CompanyCommandOutputKind
  outputPath: string
  prefetchKind?: PrefetchKind
  /**
   * Static for every command but check-inbox. check-inbox's allowlist
   * depends on which Google account(s) the company is assigned (see
   * lib/google-accounts-config.ts) — the function form lets
   * runCompanyCommandImpl resolve that once and build the exact
   * `Bash(gog -a <account> ...)` patterns for it.
   */
  bashPatterns?: string[] | ((accounts: string[]) => string[])
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
  buildPrompt: (fieldValues: Record<string, string>, today: string, prefetch: string, accounts: string[]) => string
}
