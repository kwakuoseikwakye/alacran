export type Agent = {
  id: string
  departmentId: string
  name: string
  role: string
  status: "active" | "planned" | "disabled"
  tier: "lead" | "worker" | "specialist"
  description: string
  model: string
  tools: string[]
  parentId: string | null
  instance: string
}

export type Department = {
  id: string
  name: string
  slug?: string
  tagline: string
  color?: string
  order?: number
}

export type Person = {
  id: string
  departmentId: string
  name: string
  role: string
  tools: string[]
}

export type SopTask = {
  id: string
  departmentId: string
  title: string
  summary: string
  steps: string[]
  assigneeKind: "agent" | "person"
  assigneeId: string
}

export type RosterClient = {
  id: string
  name: string
  venture: string
  status: string
  amountUsd?: number | null
  source: "funnel" | "crm" | "attio"
}

export type AgentRun = {
  id: string
  agentId: string
  status?: "running" | "completed" | "failed"
  startedAt: string
  finishedAt?: string
  endedAt?: string | null
  ok?: boolean
  summary?: string
  error?: string | null
}

export type BrainSearchResult = {
  title: string
  snippet: string
  source: string
}

