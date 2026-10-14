import { notFound } from "next/navigation"
import path from "node:path"
import { readFile } from "node:fs/promises"
import { getEffectiveAgents } from "@/lib/get-effective-agents"
import { readOntology } from "@/lib/os/ontology/read"
import { parseCompanyOntology } from "@/lib/parse-company-ontology"
import { allConnectorStatuses } from "@/lib/os/connectors/statuses"
import { readMcpServers } from "@/lib/mcp-servers-config"
import { listPendingReviews } from "@/lib/company-commands/pending-reviews"
import { PageHeader } from "@/components/os/dashboard/page-header"
import { getCompanyDepartments } from "@/lib/os/departments/registry"
import {
  StakeholderGateMatrix,
  type Stakeholder,
  type AgentRunner,
} from "@/components/os/org/stakeholder-gate-matrix"

export const dynamic = "force-dynamic"

export default async function OrgPage({
  params,
}: {
  params: Promise<{ companyId: string }>
}) {
  const { companyId } = await params
  const allAgents = await getEffectiveAgents()
  const agent = allAgents.find((a) => a.id === companyId)
  if (!agent) notFound()

  // 1. Read ontology via readOntology and raw company.yaml with parseCompanyOntology
  const ontologyResult = await readOntology(agent.rootPath)

  let rawYaml = ""
  try {
    const yamlPath = path.join(agent.rootPath, "definitions", "ontology", "company.yaml")
    rawYaml = await readFile(yamlPath, "utf-8")
  } catch {
    // File may not exist yet
  }

  const parsedWizard = rawYaml ? parseCompanyOntology(rawYaml) : null

  let stakeholders: Stakeholder[] = []

  if (ontologyResult.ok) {
    const ont = ontologyResult.ontology
    const ontRoles = ont.org.roles || []
    const ontDecisions = ont.org.decisions || []

    stakeholders = ontRoles.map((r) => {
      const decisions = ontDecisions.filter((d) => d.approver === r.id).map((d) => d.decision)
      const wizardMatch = parsedWizard?.ok
        ? parsedWizard.answers.stakeholders?.find(
            (s) =>
              s.role.toLowerCase() === r.id.toLowerCase() ||
              s.role.toLowerCase() === r.name.toLowerCase()
          )
        : undefined

      return {
        role: r.id,
        name: r.name,
        position: wizardMatch?.position,
        owns: r.owns,
        assignedGates: decisions.length > 0 ? decisions : undefined,
      }
    })
  }

  if (stakeholders.length === 0 && parsedWizard?.ok && parsedWizard.answers.stakeholders?.length) {
    stakeholders = parsedWizard.answers.stakeholders.map((s) => ({
      role: s.role,
      position: s.position,
    }))
  }

  // Fallback: If no stakeholders exist yet, register default operator
  if (stakeholders.length === 0) {
    stakeholders = [
      {
        role: "workspace-operator",
        name: agent.name || "Company Workspace Operator",
        position: "Workspace Operator & Sign-off",
        owns: "Company definitions, diff reviews, external integrations, and daily task execution.",
        assignedGates: ["Human Gate Sign-off", "Diff Review"],
      },
    ]
  }

  // 2. Detect host CLI agent runners & MCP servers
  let connectorStatuses: { id: string; state: string; detail: string }[] = []
  try {
    connectorStatuses = await allConnectorStatuses(agent.rootPath)
  } catch {
    // Fail soft if probe fails
  }

  const findStatus = (id: string) => connectorStatuses.find((c) => c.id === id)

  const claude = findStatus("claude-code")
  const kiro = findStatus("kiro")
  const kimi = findStatus("kimi")
  const agy = findStatus("antigravity")

  const detectedAgents: AgentRunner[] = [
    {
      id: "claude-code",
      name: "Claude Code CLI",
      status: claude?.state ?? "not_configured",
      detail: claude?.detail ?? "Claude Code CLI for autonomous coding sessions",
      type: "CLI Engine",
      sandboxScoped: true,
    },
    {
      id: "google-antigravity",
      name: "Google Antigravity",
      status: agy?.state ?? "not_configured",
      detail: agy?.detail ?? "Google Antigravity CLI and Gemini models",
      type: "CLI Engine",
      sandboxScoped: false,
    },
    {
      id: "kiro",
      name: "Kiro CLI",
      status: kiro?.state ?? "not_configured",
      detail: kiro?.detail ?? "Kiro CLI agent runner with workspace scope",
      type: "CLI Engine",
      sandboxScoped: true,
    },
    {
      id: "kimi",
      name: "Kimi CLI",
      status: kimi?.state ?? "not_configured",
      detail: kimi?.detail ?? "Kimi CLI tool runner",
      type: "CLI Engine",
      sandboxScoped: false,
    },
  ]

  // Read MCP servers for this company
  try {
    const mcpServers = await readMcpServers(agent.rootPath)
    if (mcpServers.length > 0) {
      mcpServers.forEach((srv) => {
        detectedAgents.push({
          id: `mcp-${srv.name}`,
          name: `MCP: ${srv.name}`,
          status: "connected",
          detail: `Project MCP server: ${srv.url}`,
          type: "MCP Server",
          sandboxScoped: true,
        })
      })
    } else {
      detectedAgents.push({
        id: "mcp-servers",
        name: "Project MCP Servers",
        status: "not_configured",
        detail: "No .mcp.json configured. Add servers via claude mcp add -s project.",
        type: "MCP Server",
        sandboxScoped: true,
      })
    }
  } catch {
    // Ignore MCP read failure
  }

  // 3. Pending reviews for Human Gate queue
  let pendingReviews: unknown[] = []
  try {
    const allPending = await listPendingReviews(allAgents)
    pendingReviews = allPending.filter((r) => r.agentId === companyId)
  } catch {
    // Fail soft
  }

  // 4. Discover active company departments from records/ and definitions/
  const departments = getCompanyDepartments(
    agent.rootPath,
    ontologyResult.ok ? ontologyResult.ontology : null
  )

  return (
    <div className="dash-content space-y-6 pb-12">
      <PageHeader
        title="Org & Governance"
      />

      <StakeholderGateMatrix
        companyId={companyId}
        stakeholders={stakeholders}
        agents={detectedAgents}
        departments={departments}
        pendingReviews={pendingReviews}
        pendingCount={pendingReviews.length}
      />
    </div>
  )
}
