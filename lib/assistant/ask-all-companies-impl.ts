import { execFile as nodeExecFile } from "node:child_process"
import { mkdir } from "node:fs/promises"
import { getAiExecutorIdForAgent } from "../ai-executor-registry"
import { getAiExecutor, DEFAULT_AI_EXECUTOR_ID, AI_EXECUTORS, type AiExecutorId } from "../ai-executors"
import {
  gatherAllCompanies,
  formatCompanyContext,
  gatherCrossCompanyDecisions,
  type CompanyContext,
  type DecisionIndexEntry,
} from "./gather-all-companies"
import { detectFocalCompanies } from "./intent-router"
import { voiceEnvelopeInstruction } from "./voice-envelope"
import { cleanAssistantStderr, explainAssistantFailure } from "./clean-stderr"
import { buildPersonaBlock, type AssistantPersona } from "./persona"
import { readAssistantExecutorIdImpl } from "../voice/settings-impl"
import { readPersonaForCompany } from "./resolve-persona"
import { asEnvelopeResult, assistantWorkspaceDir, type AskCompanyResult, type ExecFileFn, type ReadPersonaFn } from "../ask-company-impl"

/**
 * ponytail: 3 minutes, unmeasured. `askCompanyImpl` uses 2 for a single
 * company; this prompt carries every company's summary, so the model has more
 * to weigh. Raise it only against a real slow run, not on suspicion.
 */
const TIMEOUT_MS = 3 * 60_000
const MAX_QUESTION_LENGTH = 2_000

async function defaultExecFile(
  command: string,
  args: string[],
  options: { cwd: string }
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const cp = nodeExecFile(
      command,
      args,
      { ...options, timeout: TIMEOUT_MS, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(Object.assign(error, { stdout: stdout ?? "", stderr: stderr ?? "" }))
        } else {
          resolve({ stdout: stdout ?? "", stderr: stderr ?? "" })
        }
      }
    )
    cp.stdin?.end()
  })
}

/**
 * An empty, app-owned directory — never a company root and never
 * `process.cwd()`.
 *
 * Everything the model needs is already in the prompt, so it needs no file
 * access at all; an empty cwd is the honest expression of "answer only from
 * what I gave you". `buildArgs` still points Read/Grep/Glob somewhere, and this
 * is somewhere with nothing in it.
 */
export { assistantWorkspaceDir }

export type ResolveExecutorIdFn = (agentId: string) => Promise<AiExecutorId>
export type ResolveAssistantExecutorFn = () => Promise<AiExecutorId>
export type GatherDecisionsFn = () => Promise<DecisionIndexEntry[]>

const defaultGatherDecisions: GatherDecisionsFn = async () => {
  try {
    const { getEffectiveAgents } = await import("../get-effective-agents")
    const agents = await getEffectiveAgents()
    return await gatherCrossCompanyDecisions(agents)
  } catch {
    return []
  }
}

/**
 * Which engine answers a question that belongs to no single company.
 *
 * Every other spawn in this app resolves the executor from one `agentId`, and
 * here there isn't one. If every company agrees, that answer is obviously
 * right — a user who moved everything to Kiro should not have a cross-company
 * question silently answered by Claude Code, and on a machine where `claude`
 * isn't installed the default would simply fail to spawn. A mixed machine has
 * no right answer, so it takes the user's preferred assistant executor, falling
 * back to the default.
 */
export async function resolveSharedExecutorId(
  contexts: CompanyContext[],
  resolveExecutorId: ResolveExecutorIdFn = getAiExecutorIdForAgent,
  readAssistantExecutor: ResolveAssistantExecutorFn = readAssistantExecutorIdImpl
): Promise<AiExecutorId> {
  const ids = new Set(await Promise.all(contexts.map((c) => resolveExecutorId(c.id))))
  if (ids.size === 1) return [...ids][0]
  const configured = await readAssistantExecutor().catch(() => DEFAULT_AI_EXECUTOR_ID)
  return configured && configured in AI_EXECUTORS ? configured : DEFAULT_AI_EXECUTOR_ID
}

/**
 * Read-only, and the same trust tier as `askCompanyImpl` — which is why this
 * carries no `untrustedInput` flag and no fence, and runs on all three
 * executors.
 *
 * What goes in is `docs/company-summary.md` (generated from the company's own
 * skills, commands and ontology) and `definitions/ontology/company.yaml` (whose
 * every edit reached disk through the diff-and-approve gate). Both are the
 * user's own approved content about their own companies.
 *
 * **ponytail: the ceiling is `notes/company/messages/`.** That folder is chat
 * text from the eleven networks Beeper bridges — the largest injection surface
 * in the app. Adding it here would make this command `untrustedInput`, and the
 * refusal in `runCompanyCommandImpl` would then block it on Kimi
 * (`enforcesToolScope: false`) — executor neutrality breaking from the inside,
 * caused by a change that looks like a feature. If cross-company chat search is
 * ever wanted it is a separate, fenced path, not a widening of this one.
 */
export type AskAllCompaniesOptions = {
  /** If true, generates a proactive morning standup briefing synthesizing cross-company status. */
  isInitialGreeting?: boolean
  /** Explicit focal company IDs if overriding the intent router. */
  focalCompanyIds?: string[]
  /** Cross-company decisions to include in the context. */
  crossCompanyDecisions?: DecisionIndexEntry[]
  /** Spoken path: answer on the executor's quick model where it has one. */
  fast?: boolean
}

export function buildAskAllCompaniesPrompt(
  question: string,
  contexts: CompanyContext[],
  persona: AssistantPersona | null = null,
  options?: AskAllCompaniesOptions
): string {
  const introLead = options?.isInitialGreeting
    ? `The user has just sat down and opened Alacrán for the day. Give a crisp 1-3 sentence morning briefing summarizing the current operational pulse across their companies (highlight any pending reviews waiting for their approval or open blockers from recent sessions), and ask what they'd like to tackle first. Speak warmly, directly, and conversationally.`
    : `Someone is asking a question out loud about the companies they run, and wants a short spoken answer back — not a written report.`

  // Apply Two-Tier Retrieval: detect if query is focused on specific companies to compress non-focal companies
  const detected = options?.isInitialGreeting ? null : detectFocalCompanies(question, contexts)
  const focalIds = options?.focalCompanyIds ?? (detected && !detected.isBroadQuery ? detected.focalCompanyIds : undefined)

  const formattedContext = formatCompanyContext(contexts, {
    focalCompanyIds: focalIds,
    crossCompanyDecisions: options?.crossCompanyDecisions,
  })

  return `${introLead}

Below is what this computer knows about each of their companies. It is everything you have: you have no file access in this run, so do not offer to open, read or check anything.

${formattedContext}

Answer in 2-4 plain sentences, no markdown, no headings, no bullet points — this gets read aloud.

Rules:
- Name the company any claim comes from. "Acme's notes say…" not "it looks like…". A fact about one company must never be attributed to another.
- Only use what is above. If it doesn't answer the question, say exactly that and name which company you'd need more about.
- A company marked as having no description yet is one you know nothing about beyond its name. Say so rather than guessing what it does.
- Do not create, write, or edit any files; you are only answering a question.
${buildPersonaBlock(persona)}

Question: ${question}`
}

export async function askAllCompaniesImpl(
  question: string,
  /** See askCompanyImpl — the language it was SPOKEN in, when not English. */
  spokenLanguage?: string,
  gatherFn: typeof gatherAllCompanies = gatherAllCompanies,
  resolveExecutorId: ResolveExecutorIdFn = getAiExecutorIdForAgent,
  execFn: ExecFileFn = defaultExecFile,
  cwdDir: string = assistantWorkspaceDir(),
  /** See askCompanyImpl — every test injects this rather than reading the
   *  developer's own settings file. */
  readPersona: ReadPersonaFn = readPersonaForCompany,
  overrideExecutorId?: AiExecutorId,
  readAssistantExecutor: ResolveAssistantExecutorFn = readAssistantExecutorIdImpl,
  options?: AskAllCompaniesOptions,
  gatherDecisionsFn: GatherDecisionsFn = defaultGatherDecisions
): Promise<AskCompanyResult> {
  let trimmed = question.trim()
  if (!trimmed && options?.isInitialGreeting) {
    trimmed = "What is the morning operational pulse across my companies?"
  }
  if (!trimmed) return { ok: false, message: "Didn't catch a question." }
  if (trimmed.length > MAX_QUESTION_LENGTH) {
    return { ok: false, message: `That's a bit long for a spoken question (max ${MAX_QUESTION_LENGTH} characters).` }
  }

  const [contexts, decisions] = await Promise.all([
    gatherFn(),
    options?.crossCompanyDecisions ? Promise.resolve(options.crossCompanyDecisions) : gatherDecisionsFn().catch(() => []),
  ])

  if (contexts.length === 0) {
    return { ok: false, message: "There are no companies on this computer yet. Add one first." }
  }

  const [executor, persona] = await Promise.all([
    overrideExecutorId && overrideExecutorId in AI_EXECUTORS
      ? Promise.resolve(getAiExecutor(overrideExecutorId))
      : resolveSharedExecutorId(contexts, resolveExecutorId, readAssistantExecutor).then(getAiExecutor),
    // Cross-company: no single agent root, so this always resolves to the
    // machine persona (or unset) — same as passing nothing did before.
    readPersona(null),
  ])

  const effectiveOptions: AskAllCompaniesOptions = {
    ...options,
    crossCompanyDecisions: decisions,
  }

  const args = [...executor.buildArgs({
    prompt:
      buildAskAllCompaniesPrompt(trimmed, contexts, persona, effectiveOptions) +
      (spokenLanguage ? voiceEnvelopeInstruction(spokenLanguage) : ""),
    // Nothing is written, so the scope points at a path that does not exist —
    // the same null-scope idiom askCompanyImpl and installRepairImpl use.
    editScopePattern: ".alacran-never-written/**",
    bashPatterns: [],
  }), ...(options?.fast ? (executor.routineModelArgs ?? []) : [])]

  try {
    await mkdir(cwdDir, { recursive: true })
    const { stdout, stderr } = await execFn(executor.binaryName, args, { cwd: cwdDir })
    const answer = stdout.trim()
    if (!answer) {
      const cleaned = cleanAssistantStderr(stderr)
      const raw = cleaned || (stderr.trim().startsWith("Reading additional input") ? "Got no answer back." : stderr.trim()) || "Got no answer back."
      return { ok: false, message: explainAssistantFailure(raw, executor.label) }
    }
    return spokenLanguage ? asEnvelopeResult(answer) : { ok: true, answer }
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string }
    const cleaned = cleanAssistantStderr(e.stderr ?? "")
    const message =
      (e.stdout ?? "").trim() ||
      cleaned ||
      e.message ||
      (e.stderr ?? "").trim() ||
      String(err)
    return { ok: false, message: explainAssistantFailure(message, executor.label) }
  }
}
