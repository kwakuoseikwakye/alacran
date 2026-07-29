import { readFile } from "node:fs/promises"
import path from "node:path"
import { getEffectiveAgents } from "./get-effective-agents"
import { parseCompanyOntology, type ParseCompanyOntologyResult } from "./parse-company-ontology"

export async function getCompanyOntologyImpl(agentId: string): Promise<ParseCompanyOntologyResult> {
  const agents = await getEffectiveAgents()
  const agent = agents.find((a) => a.id === agentId)
  if (!agent) {
    return { ok: false, message: "Unknown company" }
  }

  const targetPath = path.join(agent.rootPath, "definitions", "ontology", "company.yaml")
  let yamlContent: string
  try {
    yamlContent = await readFile(targetPath, "utf-8")
  } catch {
    return { ok: false, message: "This company has no saved company.yaml yet" }
  }

  return parseCompanyOntology(yamlContent)
}
