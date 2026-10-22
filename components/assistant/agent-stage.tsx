"use client"

import { useEffect, useRef, useState } from "react"
import { NexusView, type NexusPanel } from "./nexus-view"
import { useElevenLabsAgent } from "@/components/use-elevenlabs-agent"
import { SPACE_OWNERS, spaceMayWake } from "@/lib/voice/agent/mic-gate"
import { DEFAULT_PREFS, parsePrefs, resolveCalm, type AgentPrefs } from "@/lib/voice/agent/agent-preferences"
import { desktopMic, micResetMessage, type DesktopMic } from "@/lib/voice/desktop-mic"
import type { AssistantPersona } from "@/lib/assistant/persona"
import type { AiExecutorId } from "@/lib/ai-executors"
import type { AssistantCompany } from "@/components/assistant/assistant-stage"

const PREFS_KEY = "alacran.agent.prefs"

function usePrefs(): [AgentPrefs, (patch: Partial<AgentPrefs>) => void, boolean, boolean] {
  const [prefs, setPrefs] = useState<AgentPrefs>(DEFAULT_PREFS)
  const [osReduced, setOsReduced] = useState(false)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    try {
      setPrefs(parsePrefs(localStorage.getItem(PREFS_KEY)))
    } catch { /* storage unavailable: defaults */ }
    const q = window.matchMedia("(prefers-reduced-motion: reduce)")
    const sync = () => setOsReduced(q.matches)
    sync()
    setReady(true)
    q.addEventListener("change", sync)
    return () => q.removeEventListener("change", sync)
  }, [])
  const update = (patch: Partial<AgentPrefs>) =>
    setPrefs((p) => {
      const next = { ...p, ...patch }
      try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  return [prefs, update, osReduced, ready]
}

export function AgentStage({
  companies, persona, initialScope, initialExecutorId, autoDispatchCompanies = [], initialPrompt = "", onInitialPromptUsed, onClose,
}: {
  companies: AssistantCompany[]
  persona: AssistantPersona | null
  initialScope: string
  initialExecutorId: AiExecutorId
  autoDispatchCompanies?: string[]
  /** A question handed over by another page (the brain map's "Confirm this fact"); sent once, as if typed. */
  initialPrompt?: string
  onInitialPromptUsed?: () => void
  onClose?: () => void
}) {
  const [prefs, updatePrefs, osReduced, ready] = usePrefs()
  const [panel, setPanel] = useState<NexusPanel>("none")
  const [focus, setFocus] = useState(false)
  const [typed, setTyped] = useState("")
  const [mic, setMic] = useState<DesktopMic | null>(null)
  const [micNote, setMicNote] = useState("")
  const agent = useElevenLabsAgent({
    scope: initialScope, executorId: initialExecutorId, companies, maxMinutes: prefs.maxMinutes,
    autoDispatch: autoDispatchCompanies,
  })
  // The orb must not move before the saved preference and the OS setting have been read.
  const calm = !ready || resolveCalm(prefs, osReduced)
  const name = persona?.assistantName || "Assistant"
  const connected = agent.connection === "connected"

  useEffect(() => setMic(desktopMic()), [])

  // Space is the mic switch, like a tap on the mic: it wakes the assistant only from inside it (waking costs
  // minutes), and never steals Space from a field or button. Esc closes an open panel.
  const latest = useRef({ agent, connected })
  latest.current = { agent, connected }
  useEffect(() => {
    const target = (e: KeyboardEvent) => e.target as HTMLElement | null
    const onDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setPanel("none"); return }
      const { agent: a, connected: live } = latest.current
      if (e.code !== "Space" || e.repeat || target(e)?.closest?.(SPACE_OWNERS)) return
      if (!spaceMayWake(live, !!target(e)?.closest?.(".nexus"))) return
      e.preventDefault()
      a.toggleMic()
    }
    window.addEventListener("keydown", onDown)
    return () => window.removeEventListener("keydown", onDown)
  }, [])

  // Deferred a tick and cancelled on cleanup, like AssistantStage's: React's development double-mount
  // would otherwise send it twice. Sending wakes the agent, which the click that handed it over asked for.
  useEffect(() => {
    if (!initialPrompt) return
    const timer = setTimeout(() => {
      latest.current.agent.sendText(initialPrompt)
      onInitialPromptUsed?.()
    }, 0)
    return () => clearTimeout(timer)
    // Once per handed-over prompt, not whenever the agent's callbacks change identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt])

  const send = (text: string) => {
    if (agent.sendText(text) && text === typed) setTyped("")
  }
  const fixMic = async () => {
    if (!mic) return
    try { setMicNote(micResetMessage((await mic.force()).status)) } catch { setMicNote("Couldn't reach macOS. Quit Alacrán, open it again, then try once more.") }
  }

  return (
    <NexusView
      name={name} display={agent.display} lines={agent.lines} toolFeed={agent.toolFeed} liveYou={agent.liveYou}
      error={agent.error} micNote={micNote} canFixMic={!!mic} onFixMic={() => { void fixMic() }}
      talking={connected && !agent.muted} prefs={prefs} calm={calm} focus={focus} panel={panel} typed={typed} companies={companies}
      levelRef={agent.audioLevelRef} binsRef={agent.frequencyBinsRef}
      onTyped={setTyped} onSend={send} onToggleMic={agent.toggleMic}
      onPanel={setPanel} onFocus={() => setFocus((f) => !f)} onPrefs={updatePrefs} onClose={onClose}
    />
  )
}
