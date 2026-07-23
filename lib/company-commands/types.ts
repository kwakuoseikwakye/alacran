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
  needsPrefetch: boolean
  buildPrompt: (fieldValues: Record<string, string>, today: string, prefetch: string) => string
}
