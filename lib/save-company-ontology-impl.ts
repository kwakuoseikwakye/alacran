import { readFile, writeFile, mkdir } from "node:fs/promises"
import path from "node:path"
import { getEffectiveAgents } from "./get-effective-agents"
import { buildCompanyOntology } from "./build-company-ontology"
import type { CompanyOntologyAnswers } from "./build-company-ontology"
import { commitFile } from "./git-commit-file"
import type { ExecFileFn } from "./git-commit-file"

export async function saveCompanyOntologyImpl(
  agentId: string,
  answers: CompanyOntologyAnswers,
  execFn?: ExecFileFn
): Promise<{ ok: true } | { ok: false; message: string }> {
  const agents = await getEffectiveAgents()
  const agent = agents.find((a) => a.id === agentId)
  if (!agent) {
    return { ok: false, message: "Unknown company" }
  }

  const templatePath = path.join(agent.rootPath, "docs", "templates", "ontology-starter.yaml")
  let templateContent: string
  try {
    templateContent = await readFile(templatePath, "utf-8")
  } catch {
    return { ok: false, message: "This company is missing docs/templates/ontology-starter.yaml" }
  }

  const yamlContent = buildCompanyOntology(agent.name, answers, templateContent)
  const relativePath = path.join("definitions", "ontology", "company.yaml")
  const targetPath = path.join(agent.rootPath, relativePath)

  await mkdir(path.dirname(targetPath), { recursive: true })
  await writeFile(targetPath, yamlContent, "utf-8")
  await commitFile(agent.rootPath, relativePath, "Define company context via AI-Native control panel", execFn)

  return { ok: true }
}
