/**
 * One ElevenLabs call, as a plain object with everything injected, so the
 * reconnect, end-once and tool rules can be tested without a browser.
 *
 * SDK shapes below come from the type definitions of @elevenlabs/client 1.27.0
 * (checked in plan Task 0). onMessage carries `role`, and onDisconnect carries
 * a `reason` of "error" | "agent" | "user". If the SDK is upgraded and a
 * callback payload changes, this is the one place to change.
 */

import { SETUP_TOOL_LABEL } from "./propose-define-company-tool"
import { TASK_TOOL_LABEL } from "./propose-agent-task-tool"

export type ConversationLike = {
  endSession(): Promise<void>
  setMicMuted(muted: boolean): void
  sendUserMessage(text: string): void
  getInputVolume(): number
  getOutputVolume(): number
  getInputByteFrequencyData(): Uint8Array
  getOutputByteFrequencyData(): Uint8Array
}

export type StartOptions = {
  signedUrl: string
  clientTools: Record<string, (params: Record<string, unknown>) => Promise<string>>
  onMessage: (m: { role: "user" | "agent"; message: string }) => void
  onModeChange: (m: { mode: "listening" | "speaking" }) => void
  onError: (message: unknown) => void
  onDisconnect: (details?: unknown) => void
}

export type EndReason = "user" | "silence" | "max-length" | "dropped" | "failed"

export type SessionEvent =
  | { type: "status"; status: "connecting" | "connected" | "reconnecting" | "ended" }
  | { type: "mode"; mode: "listening" | "speaking" }
  | { type: "message"; role: "user" | "agent"; text: string }
  | { type: "tool"; phase: "start" | "done" | "error"; question: string; detail?: string }
  | { type: "error"; message: string }
  | { type: "ended"; reason: EndReason }

export type SessionDeps = {
  mint: () => Promise<{ ok: true; signedUrl: string } | { ok: false; message: string }>
  start: (options: StartOptions) => Promise<ConversationLike>
  askCompany: (question: string, company?: string, action?: boolean) => Promise<string>
  proposeDefineCompany: (args: Record<string, unknown>) => Promise<string>
  proposeAgentTask: (args: Record<string, unknown>) => Promise<string>
  onEvent: (event: SessionEvent) => void
  /** Injected so tests do not sleep. */
  wait?: (ms: number) => Promise<void>
}

export const MAX_RECONNECTS = 3

export function createAgentSession(deps: SessionDeps) {
  const wait = deps.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  // A throwing listener must never change what the session does.
  const emit = (event: SessionEvent) => {
    try {
      deps.onEvent(event)
    } catch {
      /* listener bug, not ours */
    }
  }
  let conversation: ConversationLike | null = null
  let finished = false
  let started = false
  let reconnecting = false
  let generation = 0
  // The bound is per drop: the counter resets after a successful reconnect. A
  // link that keeps flapping is stopped by the silence and max-length guards in the hook.
  let reconnects = 0
  const SAFE_ANSWER = "I couldn't reach the company files just now."
  const SAFE_SETUP = "I couldn't prepare that just now."

  const clientTools: StartOptions["clientTools"] = {
    ask_company: async (params) => {
      if (finished) return SAFE_ANSWER
      const question = String(params?.question ?? "").trim()
      emit({ type: "tool", phase: "start", question })
      try {
        const company = typeof params?.company === "string" ? params.company : undefined
        const text = await deps.askCompany(question, company, params?.action === true)
        emit({ type: "tool", phase: "done", question })
        return text
      } catch (err) {
        emit({ type: "tool", phase: "error", question, detail: err instanceof Error ? err.message : String(err) })
        return SAFE_ANSWER
      }
    },
    propose_define_company: async (params) => {
      if (finished) return SAFE_SETUP
      emit({ type: "tool", phase: "start", question: SETUP_TOOL_LABEL })
      try {
        const text = await deps.proposeDefineCompany(params ?? {})
        emit({ type: "tool", phase: "done", question: SETUP_TOOL_LABEL })
        return text
      } catch (err) {
        emit({ type: "tool", phase: "error", question: SETUP_TOOL_LABEL, detail: err instanceof Error ? err.message : String(err) })
        return SAFE_SETUP
      }
    },
    propose_agent_task: async (params) => {
      if (finished) return SAFE_SETUP
      emit({ type: "tool", phase: "start", question: TASK_TOOL_LABEL })
      try {
        const text = await deps.proposeAgentTask(params ?? {})
        emit({ type: "tool", phase: "done", question: TASK_TOOL_LABEL })
        return text
      } catch (err) {
        emit({ type: "tool", phase: "error", question: TASK_TOOL_LABEL, detail: err instanceof Error ? err.message : String(err) })
        return SAFE_SETUP
      }
    },
  }

  async function open(): Promise<boolean> {
    const gen = ++generation
    const live = () => gen === generation && !finished
    const minted = await deps.mint()
    if (finished) return false
    if (!minted.ok) {
      emit({ type: "error", message: minted.message })
      return false
    }
    try {
      const opened = await deps.start({
        signedUrl: minted.signedUrl,
        clientTools,
        onMessage: ({ role, message }) => {
          if (live()) emit({ type: "message", role: role === "user" ? "user" : "agent", text: message })
        },
        onModeChange: ({ mode }) => {
          if (live()) emit({ type: "mode", mode })
        },
        onError: (message) => {
          if (live()) emit({ type: "error", message: String(message) })
        },
        onDisconnect: (details) => {
          if (!live()) return
          const reason = (details as { reason?: string } | undefined)?.reason
          // The agent or the user hung up on purpose: the call is over, do not redial.
          if (reason === "agent" || reason === "user") void finish("user").catch(() => {})
          else void handleDrop().catch(() => {})
        },
      })
      if (!live()) {
        // The call ended while this one was opening: close it, never expose it.
        await opened.endSession().catch(() => {})
        return false
      }
      conversation = opened
      emit({ type: "status", status: "connected" })
      return true
    } catch (err) {
      emit({ type: "error", message: err instanceof Error ? err.message : String(err) })
      return false
    }
  }

  async function handleDrop(): Promise<void> {
    if (finished || reconnecting) return
    reconnecting = true
    try {
      const old = conversation
      conversation = null
      await old?.endSession().catch(() => {})
      while (reconnects < MAX_RECONNECTS && !finished) {
        reconnects++
        emit({ type: "status", status: "reconnecting" })
        await wait(1000 * reconnects)
        if (finished) return
        if (await open()) {
          reconnects = 0
          return
        }
      }
      await finish("dropped")
    } finally {
      reconnecting = false
    }
  }

  async function finish(reason: EndReason): Promise<void> {
    if (finished) return
    finished = true
    const current = conversation
    conversation = null
    try {
      await current?.endSession()
    } catch {
      /* already closed */
    }
    emit({ type: "status", status: "ended" })
    emit({ type: "ended", reason })
  }

  return {
    async start(): Promise<void> {
      if (started || finished) return
      started = true
      emit({ type: "status", status: "connecting" })
      if (!(await open())) await finish("failed")
    },
    end: (reason: EndReason = "user") => finish(reason),
    mute(muted: boolean): void {
      conversation?.setMicMuted(muted)
    },
    send(text: string): void {
      conversation?.sendUserMessage(text)
    },
    conversation: () => conversation,
  }
}
