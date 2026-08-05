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
  bashPatterns?: string[]
  buildPrompt: (fieldValues: Record<string, string>, today: string, prefetch: string) => string
}
