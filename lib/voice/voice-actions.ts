"use server"

import { revalidatePath } from "next/cache"
import {
  readVoiceSettingsViewImpl,
  saveVoiceSettingsImpl,
  saveAssistantPersonaImpl,
  saveAssistantExecutorImpl,
  saveAutoDispatchImpl,
  readAssistantPersonaImpl,
  type VoiceSettingsView,
} from "./settings-impl"
import { createOrUpdateAgentImpl, listVoicesImpl, mintSignedUrlImpl } from "./elevenlabs-api-impl"
import { mintDeepgramGrantImpl, deepgramSocketUrl, type DeepgramGrant } from "./deepgram-grant-impl"
import type { AssistantPersona } from "../assistant/persona"

/** Never returns the key itself — only whether one is set. */
export async function readVoiceSettings(): Promise<VoiceSettingsView> {
  return readVoiceSettingsViewImpl()
}

/**
 * First-run setup and later edits both post here. Takes the four fields as one
 * object because they are saved together or not at all — a half-saved persona
 * is a form that has to be reasoned about, and there is nothing to gain from
 * being able to change only the name.
 */
export async function saveAssistantPersona(
  next: AssistantPersona
): Promise<{ ok: true; persona: AssistantPersona } | { ok: false; message: string }> {
  return saveAssistantPersonaImpl(next)
}

export async function saveVoiceSettings(
  providerId: string,
  apiKey?: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  return saveVoiceSettingsImpl({ providerId, apiKey })
}

export async function saveAssistantExecutor(
  executorId: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  return saveAssistantExecutorImpl(executorId)
}

export async function saveAutoDispatch(
  companyId: string,
  enabled: boolean
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    // `=== true`: a crafted truthy string from a client must not switch a company on.
    const result = await saveAutoDispatchImpl(companyId, enabled === true)
    if (result.ok) {
      try {
        revalidatePath("/", "layout")
      } catch {
        // The save succeeded; a stale page is not an error.
      }
    }
    return result
  } catch {
    // A throw would reach the client as Next's redacted production digest.
    return { ok: false, message: "Couldn't save that. Try again." }
  }
}

/**
 * A short-lived Deepgram pass plus the socket URL to use it against.
 *
 * The long-lived key stays in this process; the renderer gets a grant that
 * expires. Returned together so the client cannot pair a grant with a URL
 * whose audio format the worklet doesn't actually produce.
 */
export async function mintDeepgramGrant(
  language: string,
  /** The rate the caller's capture graph actually runs at — see
   *  `deepgramSocketUrl`. Defaulted so an older caller still works. */
  sampleRate?: number
): Promise<DeepgramGrant & { url?: string }> {
  const grant = await mintDeepgramGrantImpl()
  return grant.ok ? { ...grant, url: deepgramSocketUrl(language, sampleRate) } : grant
}

/** Creates the owner's agent in their own ElevenLabs account, or updates it. */
export async function createElevenLabsAgent(voiceId: string) {
  return createOrUpdateAgentImpl({ voiceId, persona: await readAssistantPersonaImpl() })
}

export async function listElevenLabsVoices() {
  return listVoicesImpl()
}

/** A signed call link. The key stays in this process. */
export async function mintElevenLabsSession() {
  return mintSignedUrlImpl()
}
