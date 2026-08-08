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
  buildPrompt: (fieldValues: Record<string, string>, today: string, prefetch: string, accounts: string[]) => string
}
