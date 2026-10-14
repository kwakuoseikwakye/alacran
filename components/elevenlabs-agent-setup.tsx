"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { createElevenLabsAgent, listElevenLabsVoices } from "@/lib/voice/voice-actions"

/** Shown under the key field once an ElevenLabs key is saved. */
export function ElevenLabsAgentSetup({
  initialReady,
  initialOutdated = false,
  initialVoiceId,
}: {
  initialReady: boolean
  /** An agent exists but was made before the newest tools did. */
  initialOutdated?: boolean
  initialVoiceId: string | null
}) {
  const [ready, setReady] = useState(initialReady)
  const [outdated, setOutdated] = useState(initialOutdated)
  const [voices, setVoices] = useState<{ id: string; name: string }[]>([])
  const [voiceId, setVoiceId] = useState(initialVoiceId ?? "")
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    listElevenLabsVoices()
      .then((r) => {
        if (cancelled) return
        if (!r.ok) return setStatus(r.message)
        setVoices(r.voices)
        setVoiceId((current) => current || r.voices[0]?.id || "")
      })
      .catch(() => {
        if (!cancelled) setStatus("Couldn't load your voices. Check your connection and try again.")
      })
      .finally(() => {
        if (!cancelled) setLoaded(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const create = async () => {
    setBusy(true)
    setStatus(null)
    const r = await createElevenLabsAgent(voiceId).catch(() => null)
    setBusy(false)
    if (!r) return setStatus("Couldn't create the agent. Try again.")
    if (!r.ok) return setStatus(r.message)
    setReady(true)
    setOutdated(false)
    setStatus(ready ? "Agent updated." : "Agent created. Open the assistant and tap the mic to talk.")
  }

  return (
    <div className="rounded-lg border border-border bg-card px-3.5 py-3">
      <p className="text-sm font-semibold">
        Your agent {ready && <span className="text-xs font-normal text-success">· ready</span>}
      </p>
      <p className="text-xs text-muted-foreground">
        Alacrán creates one agent in your ElevenLabs account. It talks; your own AI on this computer answers questions about your company. If you change the assistant&apos;s names or languages later, press Update agent so ElevenLabs gets the change.
      </p>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <select
          aria-label="Voice for your agent"
          className="h-9 min-w-0 flex-1 rounded-md border border-os-border bg-os-surface px-3 text-sm text-os-text"
          value={voiceId}
          onChange={(e) => setVoiceId(e.target.value)}
          disabled={busy || voices.length === 0}
        >
          {voices.length === 0 ? <option value="">{loaded ? "No voices available" : "Loading voices…"}</option> : null}
          {voices.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
        <Button type="button" size="sm" disabled={busy || !voiceId} onClick={() => void create()} title="Create or update the agent in your ElevenLabs account">
          {ready ? "Update agent" : "Create agent"}
        </Button>
      </div>
      {ready && outdated && (
        <p className="mt-2 text-xs text-foreground">
          Your voice agent is out of date. Press Update agent to get the latest voice features.
        </p>
      )}
      {status && <p className="mt-2 text-xs text-muted-foreground">{status}</p>}
    </div>
  )
}
