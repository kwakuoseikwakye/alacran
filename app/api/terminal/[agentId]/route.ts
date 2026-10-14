import path from "node:path"
import { getEffectiveAgents } from "@/lib/get-effective-agents"
import {
  closeSession,
  getSession,
  isValidSessionId,
  listSessions,
  countSessions,
  openSession,
  terminalAvailable,
  MAX_SESSIONS_PER_WORKSPACE,
  type TerminalKind,
} from "@/lib/terminal/sessions"
import { buildAssistantLaunch } from "@/lib/terminal/intro-command"
import { createWorkspace, deleteWorkspace, listWorkspaces, updateWorkspace } from "@/lib/terminal/workspaces"
import { DEFAULT_WORKSPACE_ID } from "@/lib/terminal/workspace-model"
import { getAiExecutor } from "@/lib/ai-executors"
import { getAiExecutorIdForAgent } from "@/lib/ai-executor-registry"
import { saveSessionNoteImpl } from "@/lib/terminal/save-session-note-impl"
import { delegateTaskImpl } from "@/lib/terminal/delegate-task-impl"
import { pickLiveAiSession } from "@/lib/terminal/pick-ai-session"
import { isGatedTask } from "@/lib/terminal/gated-task"
import { getCompanyCommand } from "@/lib/company-commands/registry"
import { COMPANY_COMMANDS_DATA_DIR } from "@/lib/company-commands/paths"
import { getCompanyCommandResultImpl } from "@/lib/company-commands/company-command-result-impl"
import { readVoiceSettingsImpl } from "@/lib/voice/settings-impl"
import { refuseNonLocal } from "@/lib/http/local-request"
import { ackStream, companyStreamResponse } from "@/lib/terminal/company-stream"
import {
  askForChangesImpl,
  discardRunImpl,
  keepRunImpl,
  listRunsImpl,
  reconcileRunsImpl,
  runChangesImpl,
  runFileDiffImpl,
  startRunImpl,
  takeOverImpl,
} from "@/lib/agent-runs/run-engine"
import { parseAckBatch, parseInputBatch } from "@/lib/terminal/input-batch"

export const dynamic = "force-dynamic"

/**
 * The in-app terminal: one SSE stream per company down (company-stream.ts),
 * POST up.
 *
 * A route handler rather than a server action because a server action cannot
 * stream, and Next's standalone `server.js` exposes no WebSocket upgrade hook
 * to attach a socket server to. On localhost a POST per keystroke burst is
 * indistinguishable from a socket, and it costs no custom server.
 *
 * **Server actions carry CSRF protection; route handlers do not.** That matters
 * more here than almost anywhere else in this app, because the POST below
 * writes into a real shell. A page on any site the user happens to be visiting
 * can send a cross-origin POST to 127.0.0.1 without a preflight, as long as it
 * keeps to a "simple" content type — the response is opaque to the attacker,
 * but the write still lands. So both checks below are load-bearing:
 *
 *   1. `Origin` must be present and equal to this request's own origin.
 *      Browsers always send `Origin` on a cross-origin POST, so this is what
 *      actually rejects the attack.
 *   2. The body must be `application/json`, which is not a simple content type
 *      and therefore forces a preflight that a cross-origin caller cannot pass.
 *
 * The GET needs neither: a cross-origin `EventSource` is a CORS request, and
 * this route sends no `Access-Control-Allow-Origin`, so the browser blocks it.
 * It does still take the Host pin, because an Origin/Host comparison alone is
 * defeated by DNS rebinding — both live in `refuseNonLocal` now, which every
 * route handler in this app calls. See lib/http/local-request.ts.
 *
 * A company can hold several sessions, addressed by a client-chosen `session`
 * id. That id is validated and the count per company is capped — it names a
 * real process, and everything a client names has to be checked before it
 * becomes one.
 */
/** The company this request is about, or null. Same boundary as everywhere
 *  else: an id the user cannot name is an id that does not resolve. */
async function resolveAgent(agentId: string) {
  const agents = await getEffectiveAgents()
  return agents.find((a) => a.id === agentId) ?? null
}

function refused(message: string, status: number) {
  return new Response(JSON.stringify({ message }), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

export async function GET(request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const refusal = refuseNonLocal(request)
  if (refusal) return refusal

  const { agentId } = await params
  const agent = await resolveAgent(agentId)
  if (!agent) return new Response("Unknown company", { status: 404 })

  const url = new URL(request.url)

  // A probe must never open a session. Next derives HEAD from GET, so asking
  // "is this available" with a HEAD would have spawned a shell as a side effect
  // of checking whether it could.
  if (url.searchParams.get("probe") === "1") {
    return Response.json({
      available: await terminalAvailable(),
      // Whether an assistant tab is even offerable. `external` folders have no
      // ontology and no skills to summarize — the same boundary Get Started
      // draws (open-interactive-terminal-with-help-impl.ts).
      canUseAssistant: agent.kind === "command-set",
      // What a workspace that names no AI of its own will run, for the new-workspace form.
      executorId: await getAiExecutorIdForAgent(agentId),
    })
  }

  // A restart forgets sessions, not runs: put any run it left behind back
  // (or settle it) before the page lists or streams this company's terminals.
  await reconcileRunsImpl(agentId).catch(() => {})

  // The review cards' data: every run this company has, and one run's files.
  if (url.searchParams.get("runs") === "1") return Response.json({ runs: await listRunsImpl(agentId) })
  const runParam = url.searchParams.get("run")
  if (runParam !== null && url.searchParams.get("changes") === "1") {
    if (!isValidSessionId(runParam)) return new Response("Bad run id", { status: 400 })
    const changes = await runChangesImpl(agentId, runParam)
    return changes ? Response.json(changes) : refused("That agent run isn't here any more.", 404)
  }
  const fileParam = url.searchParams.get("file")
  if (runParam !== null && fileParam !== null) {
    if (!isValidSessionId(runParam) || fileParam.length > 1024 || fileParam.includes("\u0000")) {
      return new Response("Bad request", { status: 400 })
    }
    const diff = await runFileDiffImpl(agentId, runParam, fileParam)
    return diff ? Response.json(diff) : refused("That file isn't one this agent changed.", 404)
  }

  // What is already running, so a reload comes back to the same tabs rather
  // than starting a fresh shell beside the ones it forgot.
  if (url.searchParams.get("list") === "1") {
    return Response.json({ sessions: listSessions(agentId), workspaces: await listWorkspaces(agentId) })
  }

  if (url.searchParams.get("stream") === "all") return companyStreamResponse(request, agentId)

  return new Response("Unknown request", { status: 400 })
}

export async function POST(request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const refusal = refuseNonLocal(request)
  if (refusal) return refusal

  const { agentId } = await params
  if (!(await resolveAgent(agentId))) return new Response("Unknown company", { status: 404 })

  let body: { type?: string; data?: string; cols?: number; rows?: number; session?: string; kind?: string; items?: unknown; workspace?: unknown; name?: unknown; executor?: unknown; stream?: unknown; task?: unknown; title?: unknown; run?: unknown; feedback?: unknown; auto?: unknown }
  try {
    body = await request.json()
  } catch {
    return new Response("Bad request", { status: 400 })
  }

  // Starting an unattended agent (lib/agent-runs). Not a pty and no session id
  // in the body: the server picks the id, because it names a branch and a
  // folder on disk.
  if (body.type === "start-run") {
    const started = await startRunImpl(agentId, {
      task: typeof body.task === "string" ? body.task : "",
      title: typeof body.title === "string" ? body.title : undefined,
    })
    if (!started.ok) return refused(started.message, 409)
    return Response.json({ id: started.id, kind: "run", label: started.label, dirty: started.dirty })
  }

  // Workspaces: named groups of terminals (lib/terminal/workspaces.ts). Not a
  // pty, so no session id; the AI a workspace runs is validated against the
  // registry there, never taken on the client's word.
  const workspaceId = typeof body.workspace === "string" ? body.workspace : ""
  if (body.type === "workspace-create") {
    const made = await createWorkspace(agentId, { name: body.name, executorId: body.executor })
    return made.ok ? Response.json({ workspace: made.workspace }) : refused(made.message, 409)
  }
  // Name and AI both editable. A new AI applies to assistants opened from now
  // on; one already running keeps the AI it started with.
  if (body.type === "workspace-update") {
    const updated = await updateWorkspace(agentId, workspaceId, { name: body.name, executorId: body.executor })
    return updated.ok ? Response.json({ workspace: updated.workspace }) : refused(updated.message, 409)
  }
  if (body.type === "workspace-delete") {
    // Deleting would orphan live processes, and ending them is the user's call.
    if (workspaceId !== DEFAULT_WORKSPACE_ID && listSessions(agentId).some((s) => s.workspaceId === workspaceId)) {
      return refused("Close the terminals in this workspace first, then delete it.", 409)
    }
    const removed = await deleteWorkspace(agentId, workspaceId)
    return removed.ok ? new Response(null, { status: 204 }) : refused(removed.message, 409)
  }

  // What a person does with a finished run (lib/agent-runs). Discard is the
  // Irreversible row of AGENTS.md §6 — the confirm dialog in front of this
  // call is the approval; this route only carries it out.
  if (body.type === "keep-run" || body.type === "discard-run" || body.type === "ask-run" || body.type === "take-over") {
    const runId = typeof body.run === "string" ? body.run : ""
    if (!isValidSessionId(runId)) return new Response("Bad run id", { status: 400 })
    if (body.type === "take-over") {
      const taken = await takeOverImpl(agentId, runId)
      return taken.ok ? Response.json({ id: taken.id, kind: "ai", label: taken.label }) : refused(taken.message, 409)
    }
    if (body.type === "ask-run") {
      const asked = await askForChangesImpl(agentId, runId, typeof body.feedback === "string" ? body.feedback : "")
      return asked.ok ? Response.json({ label: asked.label }) : refused(asked.message, 409)
    }
    const landed = body.type === "keep-run" ? await keepRunImpl(agentId, runId) : await discardRunImpl(agentId, runId)
    if (landed.ok) return Response.json({ message: landed.message })
    return new Response(JSON.stringify({ message: landed.message, files: landed.files ?? [] }), {
      status: 409,
      headers: { "Content-Type": "application/json" },
    })
  }

  if (body.type === "ack") {
    const ack = parseAckBatch(body)
    if (!ack) return new Response("Bad ack", { status: 400 })
    ackStream(ack.stream, ack.items)
    return new Response(null, { status: 204 })
  }

  if (body.type === "input-batch") {
    const items = parseInputBatch(body)
    if (!items) return new Response("Bad batch", { status: 400 })
    for (const { session, data } of items) {
      // A tab closed while its keystrokes were in flight: nothing to write to, not an error.
      getSession(agentId, session)?.pty.write(data)
    }
    return new Response(null, { status: 204 })
  }

  // Voice delegation: the owner approved this exact text on a card. Handled in THIS route for the
  // same reason `save-note` is (the session map is per-route module state, so a server action
  // would see an empty one), and it picks the newest `ai` session itself because the card has no
  // session id.
  if (body.type === "delegate-task") {
    const agent = await resolveAgent(agentId)
    if (!agent) return new Response("Unknown company", { status: 404 })
    // The spoken auto-dispatch path. The card never sets `auto`; the client's word is not taken for
    // either half: this company must be switched on, and the task must still be one the gate lets by.
    if (body.auto === true) {
      const settings = await readVoiceSettingsImpl()
      if (!settings.autoDispatchCompanies?.includes(agentId) || isGatedTask(body.task)) {
        return refused("This needs your approval on screen.", 409)
      }
      // An earlier task may still be running and waiting on a permission prompt; the Enter this types
      // would answer it. Same signal delegateTaskImpl uses for "an earlier task is unreviewed".
      // Fail-closed: a throw refuses. (`strays: null` is "no record yet", the normal first run.)
      // ponytail: an earlier task that has edited nothing and written no summary yet is not seen here.
      try {
        const command = getCompanyCommand("delegate-task")
        if (!command) throw new Error("no delegate-task command")
        const pending = await getCompanyCommandResultImpl(
          command.id,
          path.join(COMPANY_COMMANDS_DATA_DIR, agent.id),
          agent.rootPath
        )
        if (pending.changed || (pending.strays !== null && pending.strays.length > 0)) {
          return refused("This needs your approval on screen.", 409)
        }
      } catch {
        return refused("This needs your approval on screen.", 409)
      }
    }
    const picked = pickLiveAiSession(listSessions(agentId))
    const live = picked && getSession(agentId, picked.id)
    // `label` is the tab's own name, so the reply can say which agent received the task.
    const result = await delegateTaskImpl(
      agent,
      body.task,
      live ? { kind: live.kind, label: live.label, write: (data: string) => live.pty.write(data) } : undefined
    )
    return result.ok ? Response.json({ message: result.message }) : refused(result.message, 409)
  }

  const sessionId = body.session ?? ""
  if (!isValidSessionId(sessionId)) return new Response("Bad session id", { status: 400 })

  if (body.type === "kill") {
    closeSession(agentId, sessionId)
    return new Response(null, { status: 204 })
  }

  // Starting a terminal: the one action here that creates a process, so it
  // lives behind the same-origin + JSON pair rather than on the GET.
  if (body.type === "open") {
    const agent = await resolveAgent(agentId)
    if (!agent) return new Response("Unknown company", { status: 404 })
    if (!(await terminalAvailable())) {
      return refused(
        "The in-app terminal needs Node 20 or newer. This machine is running an older one, so use Open in Terminal instead.",
        503
      )
    }

    const existing = getSession(agentId, sessionId)
    if (existing) return Response.json({ id: existing.id, kind: existing.kind, label: existing.label })

    // A tab opens in the workspace the page names; one this company doesn't
    // have is refused rather than quietly filed under Main.
    const workspace = workspaceId ? (await listWorkspaces(agentId)).find((w) => w.id === workspaceId) : undefined
    if (workspaceId && !workspace) return refused("That workspace isn't here any more.", 409)

    // Each workspace has its own eight (sessions.ts), so the count is of THIS one.
    if (countSessions(agentId, workspace?.id) >= MAX_SESSIONS_PER_WORKSPACE) {
      return refused(
        `That's ${MAX_SESSIONS_PER_WORKSPACE} terminals open in this workspace, which is the limit. Close one you've finished with, or open a new workspace.`,
        429
      )
    }

    const kind: TerminalKind = body.kind === "ai" ? "ai" : "shell"
    const cols = body.cols ?? 80
    const rows = body.rows ?? 24

    if (kind === "ai") {
      if (agent.kind !== "command-set") {
        return refused(
          "This folder isn't set up as a company, so there's nothing for an assistant to read. Open a command line tab instead.",
          409
        )
      }
      // A workspace that names its own AI runs that one; otherwise the company's.
      const pinned = workspace?.executorId
      const assistant = await buildAssistantLaunch(
        agentId,
        agent.rootPath,
        pinned ? async () => getAiExecutor(pinned) : undefined
      )
      if (!assistant.ok) return refused(assistant.message, 409)
      const session = await openSession({
        agentId,
        sessionId,
        cwd: agent.rootPath,
        kind: "ai",
        label: assistant.label,
        executorId: assistant.executorId,
        workspaceId: workspace?.id,
        launch: assistant.launch,
        cols,
        rows,
      })
      if (!session) return refused(`Could not start ${assistant.label}.`, 500)
      return Response.json({ id: session.id, kind: session.kind, label: session.label })
    }

    const session = await openSession({ agentId, sessionId, cwd: agent.rootPath, kind: "shell", workspaceId: workspace?.id, cols, rows })
    if (!session) return refused("Could not start a terminal.", 500)
    return Response.json({ id: session.id, kind: session.kind, label: session.label })
  }

  // Handled here rather than as a server action for one reason that is not a
  // preference: `sessions.ts`'s Map is module state, and Next bundles server
  // modules per route — the same fact v70 recorded when its exec memo turned
  // out to be per-route rather than per-process. A server action would very
  // likely look at a different, empty Map and report every live session as
  // gone. Living in this route makes sharing structural instead of hopeful,
  // and it inherits the same-origin + JSON pair above rather than needing its
  // own.
  if (body.type === "save-note") {
    const agent = await resolveAgent(agentId)
    if (!agent) return new Response("Unknown company", { status: 404 })
    // Adapted to the two fields the impl needs, rather than the impl taking a
    // TerminalSession — that type carries a real `IPty`, and a test for this
    // logic would otherwise have to construct one.
    const live = getSession(agentId, sessionId)
    const result = await saveSessionNoteImpl(
      agent,
      live && { kind: live.kind, write: (data: string) => live.pty.write(data) }
    )
    if (!result.ok) return refused(result.message, 409)
    return Response.json({ message: result.message })
  }

  const session = getSession(agentId, sessionId)
  if (!session) return new Response("No session", { status: 409 })

  if (body.type === "resize" && body.cols && body.rows) {
    try {
      session.pty.resize(Math.max(2, body.cols), Math.max(2, body.rows))
    } catch {
      // A resize racing a dying shell is not worth a 500.
    }
  } else {
    return new Response("Unknown action", { status: 400 })
  }

  return new Response(null, { status: 204 })
}
