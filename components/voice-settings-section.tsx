"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { listVoiceProviders, getVoiceProvider, type VoiceProviderId } from "@/lib/voice/providers"
import { ElevenLabsAgentSetup } from "@/components/elevenlabs-agent-setup"
import { saveVoiceSettings } from "@/lib/voice/voice-actions"

/**
 * Where the user picks who hears them, and pastes their own key.
 *
 * **The `network` line is rendered, not summarised.** Voice is the first
 * feature in this app that sends a microphone anywhere, and the README carries
 * a "complete list of what actually leaves your machine". Showing the real
 * destination at the moment of choosing is what keeps that list true in
 * practice rather than only on paper.
 *
 * The saved key is never sent back to the browser — the server returns only
 * `hasKey`. So the field starts empty even when a key exists, and an empty
 * submit means "leave it alone" rather than "clear it".
 */
export function VoiceSettingsSection({
  initialProviderId,
  initialHasKey,
  initialAgentReady,
  initialAgentOutdated = false,
  initialVoiceId,
}: {
  initialProviderId: VoiceProviderId
  initialHasKey: boolean
  initialAgentReady: boolean
  initialAgentOutdated?: boolean
  initialVoiceId: string | null
}) {
  const [providerId, setProviderId] = useState<VoiceProviderId>(initialProviderId)
  // The one provider the saved key belongs to, or null for none. A key is only
  // ever valid for its own provider: the server drops it when the provider is
  // switched without a new key, so "has a key" is exactly "it belongs to the
  // provider on screen". Switching away and back therefore shows no key.
  const [keyProviderId, setKeyProviderId] = useState<VoiceProviderId | null>(initialHasKey ? initialProviderId : null)
  const hasKey = keyProviderId === providerId
  // Bumped whenever the key changes (saved, removed, or dropped by a provider
  // switch). The server clears the saved agent with the key, so this remounts
  // the agent setup and discards the page's first-render agent state.
  const [keyEpoch, setKeyEpoch] = useState(0)
  const [keyInput, setKeyInput] = useState("")
  const [status, setStatus] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const provider = getVoiceProvider(providerId)

  const save = async (nextId: VoiceProviderId, key?: string) => {
    setSaving(true)
    setStatus(null)
    const result = await saveVoiceSettings(nextId, key)
    setSaving(false)
    if (!result.ok) {
      setStatus(result.message)
      return
    }
    if (key !== undefined && key.trim()) {
      setKeyProviderId(nextId)
      setKeyEpoch((n) => n + 1)
      setKeyInput("")
    } else if (keyProviderId !== nextId) {
      // Provider switch (or removal) with no new key: the server dropped it.
      setKeyProviderId(null)
      setKeyEpoch((n) => n + 1)
    }
    setStatus("Saved.")
  }

  return (
    <div className="space-y-2.5">
      <div className="rounded-lg border border-border bg-card px-3.5 py-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Who hears you</p>
            <p className="text-xs text-muted-foreground">Used by the Assistant page when you speak.</p>
          </div>
          <select
            className="h-9 rounded-md border border-os-border bg-os-surface px-3 text-sm text-os-text outline-none focus-visible:border-os-accent focus-visible:ring-1 focus-visible:ring-os-accent"
            value={providerId}
            disabled={saving}
            onChange={(event) => {
              const next = event.target.value as VoiceProviderId
              setProviderId(next)
              void save(next)
            }}
            aria-label="Voice provider"
          >
            {listVoiceProviders().map((p) => (
              <option key={p.id} value={p.id} className="bg-os-surface text-os-text">
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          Switching provider removes the saved key, because each provider needs its own.
        </p>

        <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">{provider.network}</p>

        {provider.limitations && (
          <ul className="mt-2 space-y-1">
            {provider.limitations.map((line) => (
              <li key={line} className="text-xs text-muted-foreground">
                · {line}
              </li>
            ))}
          </ul>
        )}
      </div>

      {provider.needsKey && (
        <div className="rounded-lg border border-border bg-card px-3.5 py-3">
          <p className="text-sm font-semibold">
            {provider.label} key {hasKey && <span className="text-xs font-normal text-success">· saved</span>}
          </p>
          {provider.keyHint && <p className="text-xs text-muted-foreground">{provider.keyHint}</p>}
          <form
            className="mt-2.5 flex flex-wrap gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              void save(providerId, keyInput)
            }}
          >
            <Input
              type="password"
              className="min-w-0 flex-1"
              value={keyInput}
              onChange={(event) => setKeyInput(event.target.value)}
              placeholder={hasKey ? "A key is saved — paste a new one to replace it" : "Paste your key"}
              autoComplete="off"
              spellCheck={false}
              aria-label={`${provider.label} key`}
            />
            <Button type="submit" size="sm" disabled={saving || !keyInput.trim()} title="Save this key on this computer">
              Save key
            </Button>
            {hasKey && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={saving}
                title="Remove the saved key"
                onClick={() => {
                  setKeyProviderId(null)
                  setKeyEpoch((n) => n + 1)
                  // An explicit empty string clears; `undefined` would keep it.
                  void save(providerId, "")
                }}
              >
                Remove
              </Button>
            )}
          </form>
          {provider.keyLink && (
            <p className="mt-2 text-xs text-muted-foreground">
              Get one at{" "}
              <a
                href={provider.keyLink}
                target="_blank"
                rel="noreferrer"
                className="text-primary underline-offset-4 hover:underline"
              >
                {new URL(provider.keyLink).host}
              </a>
            </p>
          )}
        </div>
      )}

      {providerId === "elevenlabs" && hasKey && (
        <ElevenLabsAgentSetup
          key={keyEpoch}
          initialReady={keyEpoch === 0 && initialAgentReady}
          initialOutdated={keyEpoch === 0 && initialAgentOutdated}
          initialVoiceId={keyEpoch === 0 ? initialVoiceId : null}
        />
      )}

      {status && <p className="text-xs text-muted-foreground">{status}</p>}
    </div>
  )
}
