/**
 * `external` is a folder the user pointed at that does NOT follow this app's
 * conventions — someone else's project, a workflow repo, anything. It gets
 * exactly one action, Open in Terminal, and is deliberately excluded from
 * everything that assumes company structure (skills, setup wizard, backup,
 * ownership, MCP, Get Started). Registering one must never imply the app can
 * manage it.
 */
export type AgentKind = "pipeline" | "command-set" | "report-log" | "external"

export type Agent = {
  id: string
  name: string
  rootPath: string
  kind: AgentKind
}

export type ActivityStatus = "done"

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
