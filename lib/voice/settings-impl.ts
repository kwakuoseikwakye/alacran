import { readFile, writeFile, mkdir, chmod } from "node:fs/promises"
import path from "node:path"
import { dataPath } from "../data-dir"
import { normalizePersona, type AssistantPersona } from "../assistant/persona"
import { DEFAULT_VOICE_PROVIDER, VOICE_PROVIDERS, type VoiceProviderId } from "./providers"
import { AI_EXECUTORS, DEFAULT_AI_EXECUTOR_ID, type AiExecutorId } from "../ai-executors"

/**
 * Which voice provider this machine uses, and the key for it.
 *
 * Machine-wide rather than per-company, because the assistant page spans
 * companies — a per-company key would mean picking one company's Deepgram
 * account to answer a question about all of them.
 *
 * **The key is written to disk, and that is a real departure worth naming.**
 * README.md says "Alacrán never holds a credential of its own" — that line is
 * about the app having no account of its own, and it still doesn't. This is
 * the USER's key, pasted by them, stored under their own data directory with
 * owner-only permissions, and read only to mint a short-lived grant. The
 * closest existing precedent is the Notion token this app already reads out of
 * a company's own `.env` (`readCompanyEnvVar`); the difference is that a
 * non-technical user should not have to hand-edit a dotfile, which is the
 * whole thrust of the v71 audience decision.
 */

export type ElevenLabsAgent = {
  agentId: string
  toolId: string
  setupToolId?: string
  taskToolId?: string
  voiceId: string
}

export type VoiceSettings = {
  providerId: VoiceProviderId
  /** Present only when this provider needs one AND the user has set it. */
  apiKey?: string
  /**
   * Absent until the user has been through first-run setup, and its absence is
   * what the assistant page uses to decide to show that setup — real state on
   * disk rather than a `localStorage` "seen" flag like v39's guide, because
   * this one has content the server needs anyway to build the prompt.
   */
  persona?: AssistantPersona
  /** Which AI executor/agent answers questions for the voice assistant. */
  assistantExecutorId?: AiExecutorId
  /** The agent Alacrán created in the user's ElevenLabs account. */
  elevenlabs?: ElevenLabsAgent
  /**
   * Company ids whose spoken tasks go straight to the agent after a 5-second cancel window, instead
   * of waiting on a card. Absent means none: the card is the default and this is an opt-in.
   */
  autoDispatchCompanies?: string[]
}

const DEFAULT_SETTINGS: VoiceSettings = { providerId: DEFAULT_VOICE_PROVIDER }

export function voiceSettingsPath(): string {
  return dataPath("voice.json")
}

export async function readVoiceSettingsImpl(filePath: string = voiceSettingsPath()): Promise<VoiceSettings> {
  let raw: string
  try {
    raw = await readFile(filePath, "utf-8")
  } catch {
    return DEFAULT_SETTINGS
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== "object" || parsed === null) return DEFAULT_SETTINGS
    const { providerId, apiKey, persona, assistantExecutorId, elevenlabs, autoDispatchCompanies } = parsed as Record<string, unknown>
    // An unknown id resolves to the default rather than throwing — same rule
    // `getAiExecutorIdForAgent` follows, so a settings file written by a newer
    // version never bricks an older one.
    const id =
      typeof providerId === "string" && providerId in VOICE_PROVIDERS
        ? (providerId as VoiceProviderId)
        : DEFAULT_VOICE_PROVIDER
    const settings: VoiceSettings = { providerId: id }
    if (typeof apiKey === "string" && apiKey) settings.apiKey = apiKey
    const known = normalizePersona(persona)
    if (known) settings.persona = known
    if (typeof assistantExecutorId === "string" && assistantExecutorId in AI_EXECUTORS) {
      settings.assistantExecutorId = assistantExecutorId as AiExecutorId
    }
    if (typeof elevenlabs === "object" && elevenlabs !== null) {
      const { agentId, toolId, setupToolId, taskToolId, voiceId } = elevenlabs as Record<string, unknown>
      if (
        typeof agentId === "string" && agentId &&
        typeof toolId === "string" && toolId &&
        typeof voiceId === "string" && voiceId
      ) {
        settings.elevenlabs = {
          agentId,
          toolId,
          ...(typeof setupToolId === "string" && setupToolId ? { setupToolId } : {}),
          ...(typeof taskToolId === "string" && taskToolId ? { taskToolId } : {}),
          voiceId,
        }
      }
    }
    if (Array.isArray(autoDispatchCompanies)) {
      const ids = autoDispatchCompanies.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 128)
      if (ids.length) settings.autoDispatchCompanies = [...new Set(ids)]
    }
    return settings
  } catch {
    return DEFAULT_SETTINGS
  }
}

/**
 * One writer for the whole file, because it holds two independent things now.
 * Saving the provider must not drop the persona and saving the persona must
 * not drop the key — the failure only shows up on the *second* save, which is
 * exactly the kind nobody notices in a live pass.
 */
async function writeSettings(settings: VoiceSettings, filePath: string): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true })
  // 0600 BEFORE the content lands, so the key is never briefly world-readable.
  // writeFile's mode is only honoured when it creates the file, hence the
  // explicit chmod after for the overwrite case.
  await writeFile(filePath, `${JSON.stringify(settings, null, 2)}\n`, { encoding: "utf-8", mode: 0o600 })
  await chmod(filePath, 0o600).catch(() => {})
}

/**
 * `apiKey: undefined` LEAVES an existing key alone; `apiKey: ""` clears it.
 * The distinction matters because the Settings form re-saves the provider
 * choice without ever re-sending the stored key — a form that posts an empty
 * field would otherwise wipe the key every time someone changed the dropdown.
 */
export async function saveVoiceSettingsImpl(
  next: { providerId: string; apiKey?: string },
  filePath: string = voiceSettingsPath()
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!(next.providerId in VOICE_PROVIDERS)) {
    return { ok: false, message: "Unknown voice provider" }
  }
  const current = await readVoiceSettingsImpl(filePath)
  // A key belongs to the provider it was pasted for. Sending a Deepgram key to
  // ElevenLabs only produces a confusing "key not recognised" later, so a
  // provider switch without a new key drops it.
  const sameProvider = next.providerId === current.providerId
  const apiKey =
    next.apiKey === undefined ? (sameProvider ? current.apiKey : undefined) : next.apiKey.trim() || undefined
  // The agent lives in the account that owns the key; a different key means a different account.
  const elevenlabs = apiKey === current.apiKey ? current.elevenlabs : undefined

  await writeSettings(
    { ...current, providerId: next.providerId as VoiceProviderId, apiKey, elevenlabs },
    filePath
  )
  return { ok: true }
}

export async function saveElevenLabsAgentImpl(
  agent: ElevenLabsAgent,
  filePath: string = voiceSettingsPath()
): Promise<void> {
  const current = await readVoiceSettingsImpl(filePath)
  await writeSettings({ ...current, elevenlabs: agent }, filePath)
}

/**
 * First-run setup, and every later edit of it, write through here.
 *
 * Refuses a persona with no name at all rather than storing an empty one:
 * absence is what makes the setup card appear, so saving a blank form would
 * dismiss setup forever and leave the assistant nameless.
 */
export async function saveAssistantPersonaImpl(
  next: unknown,
  filePath: string = voiceSettingsPath()
): Promise<{ ok: true; persona: AssistantPersona } | { ok: false; message: string }> {
  const persona = normalizePersona(next)
  if (!persona) {
    return { ok: false, message: "Tell me at least one of the two names before we start." }
  }
  const current = await readVoiceSettingsImpl(filePath)
  await writeSettings({ ...current, persona }, filePath)
  return { ok: true, persona }
}

/**
 * Persist the user's preferred AI executor for the voice assistant.
 * Refuses an unknown executor ID rather than writing an unrunnable one to disk.
 */
export async function saveAssistantExecutorImpl(
  executorId: string,
  filePath: string = voiceSettingsPath()
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!(executorId in AI_EXECUTORS)) {
    return { ok: false, message: "Unknown AI executor" }
  }
  const current = await readVoiceSettingsImpl(filePath)
  await writeSettings({ ...current, assistantExecutorId: executorId as AiExecutorId }, filePath)
  return { ok: true }
}

/**
 * Switch one company's auto-dispatch on or off. Goes through `writeSettings` like every other save,
 * so it cannot drop the key or the persona, and they cannot drop it.
 */
export async function saveAutoDispatchImpl(
  companyId: string,
  enabled: boolean,
  filePath: string = voiceSettingsPath()
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (typeof companyId !== "string" || !companyId || companyId.length > 128 || /[\u0000-\u001f\u007f]/.test(companyId)) {
    return { ok: false, message: "Unknown company" }
  }
  const current = await readVoiceSettingsImpl(filePath)
  const ids = new Set(current.autoDispatchCompanies ?? [])
  if (enabled) ids.add(companyId)
  else ids.delete(companyId)
  const { autoDispatchCompanies: _old, ...rest } = current
  await writeSettings(ids.size ? { ...rest, autoDispatchCompanies: [...ids] } : rest, filePath)
  return { ok: true }
}

/** What the UI is allowed to see: never the key itself, only whether one is
 *  set. A settings page that renders a secret back into the DOM is a secret in
 *  every screenshot and every screen-share. */
export type VoiceSettingsView = {
  providerId: VoiceProviderId
  hasKey: boolean
  /** Not a secret — the names and languages are what the page greets with and
   *  what the setup form re-opens with, so unlike the key they come back. */
  persona: AssistantPersona | null
  /** Which AI executor/agent runs the voice assistant. */
  assistantExecutorId: AiExecutorId
  elevenlabsAgentReady: boolean
  /** An agent is saved but was made before the setup or task tool existed: Update agent has not been pressed since. */
  elevenlabsAgentOutdated: boolean
  elevenlabsVoiceId: string | null
  /** Companies switched on for auto-dispatch. Always an array, empty when none. */
  autoDispatchCompanies: string[]
}

export async function readVoiceSettingsViewImpl(filePath?: string): Promise<VoiceSettingsView> {
  const { providerId, apiKey, persona, assistantExecutorId, elevenlabs, autoDispatchCompanies } = await readVoiceSettingsImpl(filePath)
  return {
    providerId,
    hasKey: Boolean(apiKey),
    persona: persona ?? null,
    assistantExecutorId: assistantExecutorId ?? DEFAULT_AI_EXECUTOR_ID,
    elevenlabsAgentReady: Boolean(elevenlabs),
    elevenlabsAgentOutdated: Boolean(elevenlabs && (!elevenlabs.setupToolId || !elevenlabs.taskToolId)),
    elevenlabsVoiceId: elevenlabs?.voiceId ?? null,
    autoDispatchCompanies: autoDispatchCompanies ?? [],
  }
}

/**
 * The machine-wide persona only — company-first resolution now lives in
 * `lib/assistant/resolve-persona.ts`, which imports this function (and
 * `lib/assistant/company-persona.ts`'s reader) to build the fallback chain.
 * This file stays machine-`voice.json`-only and never imports either of
 * those two modules back, on purpose: `resolve-persona.ts` is the one place
 * that is allowed to know both leaves exist.
 */
export async function readAssistantPersonaImpl(filePath?: string): Promise<AssistantPersona | null> {
  return (await readVoiceSettingsImpl(filePath)).persona ?? null
}

/** Which AI agent/executor answers questions for the voice assistant by default. */
export async function readAssistantExecutorIdImpl(filePath?: string): Promise<AiExecutorId> {
  return (await readVoiceSettingsImpl(filePath)).assistantExecutorId ?? DEFAULT_AI_EXECUTOR_ID
}
