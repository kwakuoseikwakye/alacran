import { spawn } from "node:child_process"
import { mkdir } from "node:fs/promises"
import { getEffectiveAgents } from "@/lib/get-effective-agents"
import { getAiExecutorIdForAgent } from "@/lib/ai-executor-registry"
import { getAiExecutor, AI_EXECUTORS, type AiExecutorId } from "@/lib/ai-executors"
import { formatCompanyContext, gatherAllCompanies, gatherCrossCompanyDecisions } from "@/lib/assistant/gather-all-companies"
import { buildAppMapBlock } from "@/lib/assistant/app-map"
import {
  assistantWorkspaceDir,
  buildAskAllCompaniesPrompt,
  resolveSharedExecutorId,
} from "@/lib/assistant/ask-all-companies-impl"
import { askCwdFor, buildAskCompanyPrompt, gatherSingleCompanyContext } from "@/lib/ask-company-impl"
import { resolvePersona } from "@/lib/assistant/resolve-persona"
import { voiceEnvelopeInstruction } from "@/lib/assistant/voice-envelope"
import { cleanAssistantStderr, explainAssistantFailure } from "@/lib/assistant/clean-stderr"
import { refuseNonLocal } from "@/lib/http/local-request"
import { answerLocally, localAnswerDepsFor } from "@/lib/assistant/local-answer"
import { countWaitingApprovals } from "@/lib/os/pending-approvals"

export const dynamic = "force-dynamic"

const MAX_QUESTION_LENGTH = 2000

export type AssistantStreamRequestBody = {
  question: string
  scope: string
  spokenLanguage?: string
  executorId?: AiExecutorId
  /** The page the person asked from — the assistant is docked on every one. */
  page?: string
}

export async function POST(request: Request): Promise<Response> {
  const refusal = refuseNonLocal(request)
  if (refusal) return refusal

  let body: AssistantStreamRequestBody
  try {
    body = (await request.json()) as AssistantStreamRequestBody
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  const question = (body.question ?? "").trim()
  if (!question) {
    return new Response(JSON.stringify({ error: "Didn't catch a question." }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    })
  }

  if (question.length > MAX_QUESTION_LENGTH) {
    return new Response(
      JSON.stringify({ error: `Question too long (max ${MAX_QUESTION_LENGTH} characters)` }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }
    )
  }

  const { scope, spokenLanguage, executorId } = body
  const page = typeof body.page === "string" ? body.page.slice(0, 200) : undefined

  let prompt = ""
  let cwd = ""
  let activeExecutorId: AiExecutorId

  if (scope === "all") {
    // Cross-company: no single company owns this answer, so the machine
    // persona is the correct default — never an arbitrary company's identity.
    const persona = (await resolvePersona(null)).persona
    const [contexts, agents] = await Promise.all([
      gatherAllCompanies(),
      getEffectiveAgents(),
    ])
    const crossCompanyDecisions = await gatherCrossCompanyDecisions(agents).catch(() => [])
    activeExecutorId =
      executorId && executorId in AI_EXECUTORS
        ? executorId
        : await resolveSharedExecutorId(contexts)
    cwd = assistantWorkspaceDir()
    await mkdir(cwd, { recursive: true })
    prompt =
      buildAskAllCompaniesPrompt(question, contexts, persona, { crossCompanyDecisions }) +
      buildAppMapBlock(page) +
      (spokenLanguage ? voiceEnvelopeInstruction(spokenLanguage) : "")
  } else {
    const agents = await getEffectiveAgents()
    const agent = agents.find((a) => a.id === scope)
    if (!agent) {
      return new Response(JSON.stringify({ error: `Unknown company "${scope}"` }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      })
    }
    // Only known once the agent above is resolved — a company that has set
    // its own persona is answered by it; resolvePersona falls back to the
    // machine one otherwise.
    const persona = (await resolvePersona(agent.rootPath)).persona
    activeExecutorId =
      executorId && executorId in AI_EXECUTORS
        ? executorId
        : await getAiExecutorIdForAgent(scope)
    // Status questions have exact answers on disk: answer them here, with no
    // AI call. Typed English only — a translated question keeps the envelope.
    if (!spokenLanguage) {
      const local = await answerLocally(question, localAnswerDepsFor(agent.rootPath, () => countWaitingApprovals(agent)))
      if (local) return localAnswerStream(local)
    }
    const sandbox = await askCwdFor(getAiExecutor(activeExecutorId), agent.rootPath)
    cwd = sandbox.cwd
    const [preloadedContext, allCompanies] = await Promise.all([
      gatherSingleCompanyContext(agent.rootPath, undefined, undefined, { question }),
      gatherAllCompanies(agents).catch(() => []),
    ])
    // The person's other companies, briefly: asked from inside one company,
    // "how's the other one doing?" still has an answer.
    const others = allCompanies.filter((c) => c.id !== scope)
    const roster = others.length
      ? `

Their other companies on this computer (brief — for comparison or when they ask about one; this run can only read ${agent.name}'s files):
${formatCompanyContext(others, { briefOnly: true })}`
      : ""
    prompt =
      buildAskCompanyPrompt(question, persona, preloadedContext, sandbox.fileAccess) +
      roster +
      buildAppMapBlock(page, agent.name) +
      (spokenLanguage ? voiceEnvelopeInstruction(spokenLanguage) : "")
  }

  const executor = getAiExecutor(activeExecutorId)
  const args = executor.buildArgs({
    prompt,
    editScopePattern: ".alacran-never-written/**",
    bashPatterns: [],
  })

  // Spawn agent process with stdin closed to avoid any 3-second stdin timeout
  const cp = spawn(executor.binaryName, args, {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
  })

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      let stderrAcc = ""

      const send = (data: unknown) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch {
          /* controller may already be closed */
        }
      }

      // The meter: an estimate (≈4 characters a token) of what this question
      // sends to the user's AI, shown under the answer so memory cost is seen.
      send({ type: "meta", promptTokens: Math.round(prompt.length / 4) })

      cp.stdout.on("data", (chunk: Buffer) => {
        send({ type: "chunk", text: chunk.toString("utf-8") })
      })

      cp.stderr.on("data", (chunk: Buffer) => {
        stderrAcc += chunk.toString("utf-8")
      })

      cp.on("error", (err) => {
        send({ type: "error", message: explainAssistantFailure(err.message, executor.label) })
        try {
          controller.close()
        } catch {
          /* ignore */
        }
      })

      cp.on("close", (code) => {
        if (code === 0) {
          send({ type: "done" })
        } else {
          const cleaned = cleanAssistantStderr(stderrAcc)
          send({
            type: "error",
            message: explainAssistantFailure(cleaned || `Process exited with code ${code}`, executor.label),
          })
        }
        try {
          controller.close()
        } catch {
          /* ignore */
        }
      })

      request.signal.addEventListener("abort", () => {
        try {
          cp.kill()
        } catch {
          /* already dead */
        }
      })
    },
    cancel() {
      try {
        cp.kill()
      } catch {
        /* already dead */
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  })
}

/** The same event stream the panel reads for an AI answer, with no process behind it. */
function localAnswerStream(answer: string): Response {
  const encoder = new TextEncoder()
  const events = [{ type: "meta", local: true }, { type: "chunk", text: answer }, { type: "done" }]
  const body = new ReadableStream({
    start(controller) {
      for (const e of events) controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`))
      controller.close()
    },
  })
  return new Response(body, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  })
}
