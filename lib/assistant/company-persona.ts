import { readFile, writeFile, mkdir } from "node:fs/promises"
import path from "node:path"
import { parse, stringify } from "yaml"
import { getEffectiveAgents } from "../get-effective-agents"
import { commitFile } from "../git-commit-file"
import type { ExecFileFn } from "../git-commit-file"
import { normalizePersona, type AssistantPersona } from "./persona"

export type ReadFileFn = (filePath: string) => Promise<string>
const defaultReadFile: ReadFileFn = (filePath) => readFile(filePath, "utf-8")

/**
 * This company's assistant, in the company's own repo — same tier and same
 * shape as definitions/integrations/google.yaml. A company that never sets
 * one falls back to the machine persona and behaves exactly as before.
 *
 * Committed, unlike .env: a persona is a company fact, not a secret.
 */
export const COMPANY_PERSONA_RELATIVE_PATH = "definitions/integrations/assistant.yaml"

export async function readCompanyPersona(
  agentRootPath: string,
  readFileFn: ReadFileFn = defaultReadFile
): Promise<AssistantPersona | null> {
  try {
    const raw = await readFileFn(path.join(agentRootPath, COMPANY_PERSONA_RELATIVE_PATH))
    return normalizePersona(parse(raw))
  } catch {
    return null
  }
}

export async function saveCompanyPersonaImpl(
  agentId: string,
  persona: AssistantPersona,
  execFn?: ExecFileFn
): Promise<{ ok: true } | { ok: false; message: string }> {
  const agent = (await getEffectiveAgents()).find((a) => a.id === agentId)
  if (!agent) return { ok: false, message: "Unknown company" }
  const normalized = normalizePersona(persona)
  if (!normalized) return { ok: false, message: "That persona isn't usable." }

  const target = path.join(agent.rootPath, COMPANY_PERSONA_RELATIVE_PATH)
  await mkdir(path.dirname(target), { recursive: true })
  await writeFile(target, stringify(normalized), "utf-8")
  // A failed commit is not a failed save — same rule as saveGoogleAccountsImpl.
  try {
    await commitFile(
      agent.rootPath,
      COMPANY_PERSONA_RELATIVE_PATH,
      "Update assistant persona via AI-Native control panel",
      execFn
    )
  } catch {}
  return { ok: true }
}
