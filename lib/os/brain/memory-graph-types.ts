export type KnowledgeState = "always" | "lookup" | "unsure"
export type MemoryNodeType = "fact" | "decision" | "note" | "session" | "skill" | "hub"
export type MemoryNode = {
  id: string
  type: MemoryNodeType
  label: string
  path: string
  summary: string
  state: KnowledgeState
}
export type MemoryEdge = { source: string; target: string }
export type MemoryGraph = {
  nodes: MemoryNode[]
  edges: MemoryEdge[]
  counts: { alwaysFiles: number; lookupFiles: number; unsureFacts: number }
}
export type CompanyFact = {
  id: string
  label: string
  keyPath: string
  summary: string
  unsure: boolean
}
