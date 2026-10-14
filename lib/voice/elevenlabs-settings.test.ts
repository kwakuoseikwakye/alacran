import { describe, expect, it, beforeEach, afterEach } from "vitest"
import { mkdtemp, rm, readFile, writeFile } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { VOICE_PROVIDERS, getVoiceProvider } from "./providers"
import {
  readVoiceSettingsImpl,
  readVoiceSettingsViewImpl,
  saveVoiceSettingsImpl,
  saveElevenLabsAgentImpl,
} from "./settings-impl"

let dir: string
let file: string
beforeEach(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "voice-"))
  file = path.join(dir, "voice.json")
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const agent = { agentId: "agent_1", toolId: "tool_1", voiceId: "voice_1" }

describe("elevenlabs provider entry", () => {
  it("is registered, needs a key, and says where the voice goes", () => {
    const p = VOICE_PROVIDERS.elevenlabs
    expect(p.id).toBe("elevenlabs")
    expect(p.needsKey).toBe(true)
    expect(p.stt && p.tts).toBe(true)
    expect(p.network).toMatch(/ElevenLabs/)
    expect(p.network).toMatch(/AI model/i)
    expect(getVoiceProvider("elevenlabs").id).toBe("elevenlabs")
  })
})

describe("elevenlabs agent storage", () => {
  it("round-trips the agent and reports it as ready in the view, without the key", async () => {
    await saveVoiceSettingsImpl({ providerId: "elevenlabs", apiKey: "xi-secret" }, file)
    await saveElevenLabsAgentImpl(agent, file)
    expect((await readVoiceSettingsImpl(file)).elevenlabs).toEqual(agent)
    const view = await readVoiceSettingsViewImpl(file)
    expect(view.elevenlabsAgentReady).toBe(true)
    expect(view.elevenlabsVoiceId).toBe("voice_1")
    expect(JSON.stringify(view)).not.toContain("xi-secret")
  })

  it("flags an agent saved without the setup or task tool as outdated, and only that", async () => {
    await saveVoiceSettingsImpl({ providerId: "elevenlabs", apiKey: "xi-secret" }, file)
    expect((await readVoiceSettingsViewImpl(file)).elevenlabsAgentOutdated).toBe(false) // no agent at all
    await saveElevenLabsAgentImpl(agent, file)
    expect((await readVoiceSettingsViewImpl(file)).elevenlabsAgentOutdated).toBe(true)
    await saveElevenLabsAgentImpl({ ...agent, setupToolId: "s" }, file)
    expect((await readVoiceSettingsViewImpl(file)).elevenlabsAgentOutdated).toBe(true)
    await saveElevenLabsAgentImpl({ ...agent, setupToolId: "s", taskToolId: "t" }, file)
    expect((await readVoiceSettingsViewImpl(file)).elevenlabsAgentOutdated).toBe(false)
  })

  it("ignores a half-written agent record", async () => {
    await writeFile(file, JSON.stringify({ providerId: "elevenlabs", apiKey: "k", elevenlabs: { agentId: "a" } }))
    expect((await readVoiceSettingsImpl(file)).elevenlabs).toBeUndefined()
  })

  it("drops the saved agent when the key is replaced, because the agent belongs to the old account", async () => {
    await saveVoiceSettingsImpl({ providerId: "elevenlabs", apiKey: "old" }, file)
    await saveElevenLabsAgentImpl(agent, file)
    await saveVoiceSettingsImpl({ providerId: "elevenlabs", apiKey: "new" }, file)
    expect((await readVoiceSettingsImpl(file)).elevenlabs).toBeUndefined()
  })

  it("keeps the agent when the same provider is re-saved without a key", async () => {
    await saveVoiceSettingsImpl({ providerId: "elevenlabs", apiKey: "k" }, file)
    await saveElevenLabsAgentImpl(agent, file)
    await saveVoiceSettingsImpl({ providerId: "elevenlabs" }, file)
    expect((await readVoiceSettingsImpl(file)).elevenlabs).toEqual(agent)
  })

  it("round-trips the setup tool id, and still reads an older record that has none", async () => {
    await saveVoiceSettingsImpl({ providerId: "elevenlabs", apiKey: "k" }, file)
    await saveElevenLabsAgentImpl({ ...agent, setupToolId: "setup_1" }, file)
    expect((await readVoiceSettingsImpl(file)).elevenlabs).toEqual({ ...agent, setupToolId: "setup_1" })

    await writeFile(file, JSON.stringify({ providerId: "elevenlabs", apiKey: "k", elevenlabs: agent }))
    expect((await readVoiceSettingsImpl(file)).elevenlabs).toEqual(agent)
  })

  it("round-trips the task tool id, and still reads records that have only the earlier ids", async () => {
    await saveVoiceSettingsImpl({ providerId: "elevenlabs", apiKey: "k" }, file)
    await saveElevenLabsAgentImpl({ ...agent, setupToolId: "setup_1", taskToolId: "task_1" }, file)
    expect((await readVoiceSettingsImpl(file)).elevenlabs).toEqual({ ...agent, setupToolId: "setup_1", taskToolId: "task_1" })
    await writeFile(file, JSON.stringify({ providerId: "elevenlabs", apiKey: "k", elevenlabs: { ...agent, setupToolId: "setup_1" } }))
    expect((await readVoiceSettingsImpl(file)).elevenlabs).toStrictEqual({ ...agent, setupToolId: "setup_1" })
  })
})

describe("a key belongs to one provider", () => {
  it("drops a saved Deepgram key when switching provider without a new key", async () => {
    await saveVoiceSettingsImpl({ providerId: "deepgram", apiKey: "dg-key" }, file)
    await saveVoiceSettingsImpl({ providerId: "elevenlabs" }, file)
    expect((await readVoiceSettingsImpl(file)).apiKey).toBeUndefined()
    expect(await readFile(file, "utf-8")).not.toContain("dg-key")
  })

  it("keeps the key when the provider is unchanged", async () => {
    await saveVoiceSettingsImpl({ providerId: "deepgram", apiKey: "dg-key" }, file)
    await saveVoiceSettingsImpl({ providerId: "deepgram" }, file)
    expect((await readVoiceSettingsImpl(file)).apiKey).toBe("dg-key")
  })
})
