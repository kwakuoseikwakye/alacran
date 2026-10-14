"use client"

import { cancelActiveDispatch, heardCancel, isCancelWords, isDispatchActive } from "@/lib/voice/agent/dispatch-timer"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { askCompany } from "@/lib/ask-company"
import { askAllCompanies } from "@/lib/assistant/ask-all-companies"
import { mintElevenLabsSession } from "@/lib/voice/voice-actions"
import {
  createAgentSession,
  type SessionEvent,
} from "@/lib/voice/agent/session"
import { runAskCompanyTool, type AskFn } from "@/lib/voice/agent/ask-company-tool"
import { runProposeDefineCompanyTool } from "@/lib/voice/agent/propose-define-company-tool"
import { runProposeAgentTaskTool } from "@/lib/voice/agent/propose-agent-task-tool"
import { deriveDisplay, type AgentConnection } from "@/lib/voice/agent/agent-state"
import { callShouldEnd } from "@/lib/voice/agent/call-guard"
import { isUserActivity } from "@/lib/voice/agent/user-activity"
import { createMicGate } from "@/lib/voice/agent/mic-gate"
import { END_NOTE, WAKE_FAILED, createWakeQueue } from "@/lib/voice/agent/wake"
import type { ActionProposal } from "@/lib/assistant/action-envelope"
import type { AiExecutorId } from "@/lib/ai-executors"
import type { AssistantCompany } from "@/components/assistant/assistant-stage"

const UNSENT = " What you typed wasn't sent."

export type AgentLine = { id: number; role: "you" | "assistant"; text: string; proposal?: ActionProposal | null }
export type ToolFeedItem = { id: number; at: number; question: string; state: "running" | "done" | "error"; detail?: string }

const ALL = "all"
const CONNECT_TIMEOUT_MS = 30_000

export function useElevenLabsAgent(opts: {
  scope: string
  executorId: AiExecutorId
  companies: AssistantCompany[]
  maxMinutes: number
  autoDispatch?: readonly string[]
}) {
  const { scope, executorId, companies, maxMinutes, autoDispatch } = opts
  const [connection, setConnection] = useState<AgentConnection>("idle")
  const [mode, setMode] = useState<"listening" | "speaking">("listening")
  const [toolRunning, setToolRunning] = useState(false)
  const [awaitingReply, setAwaitingReply] = useState(false)
  const [lines, setLines] = useState<AgentLine[]>([])
  const [toolFeed, setToolFeed] = useState<ToolFeedItem[]>([])
  const [liveYou, setLiveYou] = useState("")
  const [liveAgent, setLiveAgent] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [muted, setMuted] = useState(false)

  const audioLevelRef = useRef<number | null>(0)
  const frequencyBinsRef = useRef<Uint8Array | null>(null)
  const idRef = useRef(0)
  const nextId = () => ++idRef.current
  const startedAtRef = useRef(0)
  const lastActivityRef = useRef(0)
  const sessionRef = useRef<ReturnType<typeof createAgentSession> | null>(null)
  // Events from a call that was replaced by a newer one are dropped.
  const callIdRef = useRef(0)
  const connectionRef = useRef<AgentConnection>("idle")
  connectionRef.current = connection
  // Typed texts the wake queue dropped when the conversation ended, told to the owner with the end note.
  const droppedRef = useRef(0)
  // Latest values for callbacks created once per call.
  const live = useRef({ scope, executorId, companies, maxMinutes, autoDispatch })
  live.current = { scope, executorId, companies, maxMinutes, autoDispatch }
  // When the pending task strip appeared; a cancel word in that same breath belongs to the task, not to a stop.
  const dispatchShownAtRef = useRef(0)
  const gateRef = useRef<ReturnType<typeof createMicGate> | null>(null)
  if (!gateRef.current) {
    gateRef.current = createMicGate({
      mute: (m) => sessionRef.current?.mute(m),
      onMuted: setMuted,
      touch: () => { lastActivityRef.current = Date.now() },
      // The mic is a switch the owner turns on: it stays closed until they do, so it never hears the room unasked.
      pushToTalk: () => true,
    })
  }
  const gate = gateRef.current
  const wakeRef = useRef<ReturnType<typeof createWakeQueue> | null>(null)
  if (!wakeRef.current) wakeRef.current = createWakeQueue()
  const wake = wakeRef.current

  const ask = useCallback<AskFn>(async (scopeId, question, options) => {
    const fast = options?.fast ?? true
    const ex = live.current.executorId
    return scopeId === ALL ? askAllCompanies(question, undefined, ex, { fast }) : askCompany(scopeId, question, undefined, ex, { fast })
  }, [])

  const deliver = useCallback((t: string) => {
    if (isDispatchActive() && isCancelWords(t)) cancelActiveDispatch()
    lastActivityRef.current = Date.now()
    sessionRef.current?.send(t)
    setLiveYou(t)
    setAwaitingReply(true)
    setLines((l) => [...l, { id: nextId(), role: "you", text: t }])
  }, [])

  // A proposal goes on screen the moment its tool returns. The agent may already have said "it's on screen"
  // before the tool answered, so waiting for its next message could leave the owner with nothing to approve.
  const showProposal = useCallback((proposal: ActionProposal) => {
    if (proposal.fields.auto === "1") dispatchShownAtRef.current = Date.now()
    setLines((l) => [...l, { id: nextId(), role: "assistant", text: "", proposal }])
  }, [])

  const onEvent = useCallback((e: SessionEvent) => {
    if (isUserActivity(e)) lastActivityRef.current = Date.now()
    // Words that stop a pending send, and the end of the call, both cancel it. A stop never sends.
    if (e.type === "message" && e.role === "user" && isDispatchActive() && heardCancel(e.text, dispatchShownAtRef.current, Date.now())) cancelActiveDispatch()
    // A dropped call has no voice channel left to say cancel on, so the countdown stops.
    if (e.type === "status" && (e.status === "ended" || e.status === "reconnecting")) cancelActiveDispatch()
    switch (e.type) {
      case "status":
        setConnection(e.status)
        connectionRef.current = e.status // the ref lags a render; a press right after the drain must deliver, not queue
        // A muted mic stays muted across a reconnect: the new conversation starts unmuted.
        if (e.status === "connected") {
          gate.onConnected()
          // What the owner did while it was waking up, replayed once now that a conversation exists.
          const woke = wake.drain()
          if (woke.talk) gate.talk(true)
          for (const t of woke.texts) deliver(t)
        }
        if (e.status === "ended") {
          // Free the ref so Start works again, and clear display state a new call must not inherit.
          sessionRef.current = null
          setMode("listening")
          setAwaitingReply(false)
          setToolRunning(false)
          gate.clear()
          droppedRef.current = wake.clear()
        }
        break
      case "mode":
        setMode(e.mode)
        if (e.mode === "speaking") setAwaitingReply(false)
        break
      case "message":
        if (e.role === "user") {
          setLiveYou(e.text)
          setAwaitingReply(true)
          setLines((l) => [...l, { id: nextId(), role: "you", text: e.text }])
        } else {
          setLiveAgent(e.text)
          setAwaitingReply(false)
          setLines((l) => [...l, { id: nextId(), role: "assistant", text: e.text }])
        }
        break
      case "tool":
        if (e.phase === "start") {
          setToolRunning(true)
          setToolFeed((f) => [...f, { id: nextId(), at: Date.now(), question: e.question, state: "running" }])
        } else {
          setToolRunning(false)
          setToolFeed((f) => {
            const i = f.map((x) => x.state).lastIndexOf("running")
            if (i < 0) return f
            const copy = [...f]
            copy[i] = { ...copy[i], state: e.phase === "done" ? "done" : "error", detail: e.detail }
            return copy
          })
        }
        break
      case "error":
        setError(e.message)
        break
      case "ended": {
        const note = END_NOTE[e.reason]
        const unsent = droppedRef.current ? UNSENT : ""
        droppedRef.current = 0
        if (note || unsent) setError((prev) => `${note ?? prev ?? ""}${unsent}`.trim())
        break
      }
    }
  }, [gate, wake, deliver])

  const start = useCallback(() => {
    if (sessionRef.current) return
    setError(null)
    setMode("listening")
    setAwaitingReply(false)
    setToolRunning(false)
    setConnection("connecting")
    gate.reset() // the mic starts closed until the owner turns it on
    const callId = ++callIdRef.current
    startedAtRef.current = Date.now()
    lastActivityRef.current = Date.now()
    const session = createAgentSession({
      mint: async () => {
        try {
          return await mintElevenLabsSession()
        } catch {
          return { ok: false as const, message: WAKE_FAILED.mint }
        }
      },
      askCompany: async (question, company, action) => {
        const result = await runAskCompanyTool(
          { question, company, action },
          { scope: live.current.scope, companies: live.current.companies, ask }
        )
        if (result.proposal && callIdRef.current === callId) showProposal(result.proposal)
        return result.text
      },
      proposeDefineCompany: async (args) => {
        const result = runProposeDefineCompanyTool(args, { scope: live.current.scope, companies: live.current.companies })
        if (result.proposal && callIdRef.current === callId) showProposal(result.proposal)
        return result.text
      },
      proposeAgentTask: async (args) => {
        const result = runProposeAgentTaskTool(args, {
          scope: live.current.scope,
          companies: live.current.companies,
          autoDispatch: live.current.autoDispatch,
          dispatchBusy: isDispatchActive() || connectionRef.current !== "connected",
        })
        if (result.proposal && callIdRef.current === callId) showProposal(result.proposal)
        return result.text
      },
      onEvent: (e) => {
        if (callId === callIdRef.current) onEvent(e)
      },
      start: async (o) => {
        const { Conversation } = await import("@elevenlabs/client")
        return await Conversation.startSession({
          textOnly: false,
          signedUrl: o.signedUrl,
          connectionType: "websocket",
          clientTools: o.clientTools,
          onMessage: o.onMessage,
          onModeChange: o.onModeChange,
          onError: o.onError,
          onDisconnect: o.onDisconnect,
        })
      },
    })
    sessionRef.current = session
    void session.start().catch(() => {
      if (callId !== callIdRef.current) return
      sessionRef.current = null
      const unsent = wake.clear() ? UNSENT : ""
      void session.end("failed").catch(() => {})
      setConnection("ended")
      setError(WAKE_FAILED.start + unsent)
    })
  }, [ask, onEvent, gate, wake, showProposal])

  // Timer, silence and maximum-length guard. The owner pays per minute.
  useEffect(() => {
    if (connection !== "connected" && connection !== "reconnecting") return
    const timer = setInterval(() => {
      const now = Date.now()
      const reason = callShouldEnd({
        startedAt: startedAtRef.current,
        lastActivityAt: lastActivityRef.current,
        now,
        maxMinutes: live.current.maxMinutes,
      })
      if (reason) {
        const session = sessionRef.current
        sessionRef.current = null
        void session?.end(reason)
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [connection])

  // Orb levels, read straight from the SDK each frame. Refs, not state: 60 renders a second would stutter the orb.
  useEffect(() => {
    if (connection !== "connected") {
      audioLevelRef.current = 0
      frequencyBinsRef.current = null
      return
    }
    let raf = 0
    const tick = () => {
      const c = sessionRef.current?.conversation()
      if (c) {
        audioLevelRef.current = mode === "speaking" ? c.getOutputVolume() : c.getInputVolume()
        frequencyBinsRef.current = mode === "speaking" ? c.getOutputByteFrequencyData() : c.getInputByteFrequencyData()
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [connection, mode])

  // A hung mint or a hung startSession must not leave the UI on "connecting" forever.
  useEffect(() => {
    if (connection !== "connecting") return
    const t = setTimeout(() => {
      const session = sessionRef.current
      sessionRef.current = null
      setError("Couldn't connect to ElevenLabs. Check your internet connection and try again.")
      void session?.end("failed")
    }, CONNECT_TIMEOUT_MS)
    return () => clearTimeout(t)
  }, [connection])

  // The stage unmounts when the dock closes; that must end the session, or it keeps billing.
  useEffect(
    () => () => {
      cancelActiveDispatch() // the ended event is dropped by the call-id guard below, so stop a pending send here
      callIdRef.current++ // late events from this session must not setState after unmount
      const session = sessionRef.current
      sessionRef.current = null
      void session?.end("user")
    },
    []
  )

  /** The mic is a switch: one tap turns it on, the next turns it off. The first tap also wakes the assistant. */
  const toggleMic = useCallback(() => {
    if (connectionRef.current === "connected") { gate.talk(gate.isMuted()); return }
    if (wake.toggleTalk()) start()
  }, [gate, start, wake])

  /** Typing works any time. Before the conversation exists the text waits and is sent the moment it connects. */
  const sendText = useCallback((text: string) => {
    const t = text.trim()
    if (!t) return false
    // Queued text never reaches deliver(), so a typed stop must be heard here too.
    if (isDispatchActive() && isCancelWords(t)) cancelActiveDispatch()
    if (connectionRef.current === "connected") deliver(t)
    else {
      wake.queueText(t)
      start()
    }
    return true
  }, [deliver, start, wake])

  const display = useMemo(
    () => deriveDisplay({ connection, mode, toolRunning, awaitingReply }),
    [connection, mode, toolRunning, awaitingReply]
  )

  return {
    display, connection, lines, toolFeed, liveYou, liveAgent, error, muted,
    toggleMic, sendText, audioLevelRef, frequencyBinsRef,
  }
}
