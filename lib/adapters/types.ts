export type AgentKind = "pipeline" | "command-set" | "report-log"

export type Agent = {
  id: string
  name: string
  rootPath: string
  kind: AgentKind
}

export type ActivityStatus = "done" | "needs-attention" | "unknown"

export type Activity = {
  id: string
  agentId: string
  type: string
  timestamp: number
  title: string
  status: ActivityStatus
  detailPath: string
}

export type Adapter = (agent: Agent) => Promise<Activity[]>
