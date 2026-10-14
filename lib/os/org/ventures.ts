import type { LifeArea } from "@/lib/os/brain/life-map"
import { LIFE_AREAS } from "@/lib/os/brain/life-map"

export type Venture = {
  id: string
  label: string
  kind: string
  color: string
  detail: string
  brainTag: string
  focus: string[]
  areaAgents: Record<string, string[]>
}

const SHARED_OPS = ["conductor", "stack-monitor"]
const SHARED_KNOWLEDGE = ["data-agent", "markdown-auditor", "vector-auditor"]

export const VENTURES: Venture[] = [
  {
    id: "vantage",
    label: "Vantage",
    kind: "AI agency",
    color: "#00ffaa",
    detail: "Client AI builds and delivery — the agency arm.",
    brainTag: "vantage",
    focus: [
      "Active client builds shipped on schedule",
      "Pipeline: proposals out, deals advanced in Ledger",
      "Delivery quality — every handoff documented in G-Brain",
    ],
    areaAgents: {
      marketing: ["social-agent", "postly-publisher", "reelkit-editor", "renderly-creative"],
      sales: ["vantage-sales", "vantage-paykit", "sales-agent", "sales-calls-data"],
      comms: ["comms-agent", "gmail-worker", "slack-worker", "crm-pulse"],
      finance: ["payments-pulse", "stripe-sales", "processor-confirmation"],
      tech: [...SHARED_KNOWLEDGE, "notion-sync"],
      operations: SHARED_OPS,
    },
  },
  {
    id: "launchpad-cohort",
    label: "Launchpad Cohort",
    kind: "Mentorship program",
    color: "#d9263f",
    detail: "The mentorship — students, curriculum, community.",
    brainTag: "launchpad-cohort",
    focus: [
      "Student results — track wins, unblock stuck students fast",
      "Content + newsletter cadence for enrollment",
      "Community pulse on WhatsApp; T1 response times hold",
    ],
    areaAgents: {
      marketing: ["social-agent", "adsmith-creative", "postly-publisher", "dmflow-mcp", "reelkit-editor"],
      sales: ["launchpad-cohort-sales", "paykit-sales", "sales-agent", "sales-calls-data"],
      comms: ["whatsapp-worker", "gmail-worker", "comms-agent", "crm-pulse"],
      finance: ["payments-pulse", "stripe-sales", "flexpay-financing", "processor-confirmation"],
      tech: SHARED_KNOWLEDGE,
      operations: SHARED_OPS,
    },
  },
]

export function getVenture(id: string): Venture | null {
  return VENTURES.find((v) => v.id === id) ?? null
}

export function ventureAgentSet(ventureId: string): Set<string> {
  const v = getVenture(ventureId)
  return new Set(v ? Object.values(v.areaAgents).flat() : [])
}

export function venturesForAgent(agentId: string): Venture[] {
  return VENTURES.filter((v) => ventureAgentSet(v.id).has(agentId))
}

export function ventureAreaAgents(ventureId: string, areaId: string): string[] {
  return getVenture(ventureId)?.areaAgents[areaId] ?? []
}

export function lifeAreaById(areaId: string): LifeArea | null {
  return LIFE_AREAS.find((a) => a.id === areaId) ?? null
}
