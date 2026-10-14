import { describe, expect, it, beforeEach, afterEach } from "vitest"
import { mkdtemp, rm, readFile, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  readVoiceSettingsImpl,
  saveVoiceSettingsImpl,
  saveAssistantPersonaImpl,
  saveAssistantExecutorImpl,
  readVoiceSettingsViewImpl,
  readAssistantExecutorIdImpl,
  saveAutoDispatchImpl,
} from "./settings-impl"

let dir: string
let file: string

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "voice-settings-"))
  file = path.join(dir, "voice.json")
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

describe("readVoiceSettingsImpl", () => {
  it("defaults to the browser provider when nothing is saved", async () => {
    expect(await readVoiceSettingsImpl(file)).toEqual({ providerId: "browser" })
  })

  it("falls back to the default for an unknown provider rather than throwing", async () => {
    // A settings file written by a newer version must never brick an older one
    // — the same rule getAiExecutorIdForAgent follows for retired executors.
    await writeFile(file, JSON.stringify({ providerId: "whisper-9000" }), "utf-8")
    expect(await readVoiceSettingsImpl(file)).toEqual({ providerId: "browser" })
  })

  it("survives a corrupt file", async () => {
    await writeFile(file, "{not json", "utf-8")
    expect(await readVoiceSettingsImpl(file)).toEqual({ providerId: "browser" })
  })
})

describe("saveVoiceSettingsImpl", () => {
  it("refuses an unknown provider", async () => {
    const result = await saveVoiceSettingsImpl({ providerId: "nope" }, file)
    expect(result).toEqual({ ok: false, message: "Unknown voice provider" })
  })

  it("writes the key owner-only, never world-readable", async () => {
    await saveVoiceSettingsImpl({ providerId: "deepgram", apiKey: "dg-secret" }, file)
    const mode = (await stat(file)).mode & 0o777
    expect(mode).toBe(0o600)
  })

  it("keeps an existing key when apiKey is omitted", async () => {
    // The Settings form re-saves the provider without re-sending the stored
    // key; if omission cleared it, changing the dropdown would wipe the key.
    await saveVoiceSettingsImpl({ providerId: "deepgram", apiKey: "dg-secret" }, file)
    await saveVoiceSettingsImpl({ providerId: "deepgram" }, file)
    expect((await readVoiceSettingsImpl(file)).apiKey).toBe("dg-secret")
  })

  it("clears the key when given an explicitly empty string", async () => {
    await saveVoiceSettingsImpl({ providerId: "deepgram", apiKey: "dg-secret" }, file)
    await saveVoiceSettingsImpl({ providerId: "deepgram", apiKey: "  " }, file)
    expect((await readVoiceSettingsImpl(file)).apiKey).toBeUndefined()
  })

  it("round-trips the provider choice", async () => {
    await saveVoiceSettingsImpl({ providerId: "deepgram", apiKey: "k" }, file)
    expect((await readVoiceSettingsImpl(file)).providerId).toBe("deepgram")
  })
})

describe("saveAssistantPersonaImpl", () => {
  const PERSONA = { assistantName: "Jarvis", userName: "Sam", spokenLanguage: "ja-JP", replyLanguage: "en-US", voiceURI: "" }

  it("round-trips through the view", async () => {
    expect(await saveAssistantPersonaImpl(PERSONA, file)).toEqual({ ok: true, persona: PERSONA })
    expect((await readVoiceSettingsViewImpl(file)).persona).toEqual(PERSONA)
  })

  it("refuses a form with neither name, so setup cannot be dismissed by an empty save", async () => {
    const result = await saveAssistantPersonaImpl({ assistantName: "", userName: " " }, file)
    expect(result.ok).toBe(false)
    expect((await readVoiceSettingsViewImpl(file)).persona).toBeNull()
  })

  /**
   * Both directions, because one file now holds two independent things and
   * the failure only appears on the SECOND save — the shape a live pass walks
   * straight past.
   */
  it("keeps the key when the persona is saved, and the persona when the provider is", async () => {
    await saveVoiceSettingsImpl({ providerId: "deepgram", apiKey: "dg-secret" }, file)
    await saveAssistantPersonaImpl(PERSONA, file)
    expect((await readVoiceSettingsImpl(file)).apiKey).toBe("dg-secret")

    await saveVoiceSettingsImpl({ providerId: "browser" }, file)
    expect((await readVoiceSettingsImpl(file)).persona).toEqual(PERSONA)
  })
})

describe("saveAssistantExecutorImpl", () => {
  it("saves the chosen executor and round-trips through view and reader", async () => {
    const result = await saveAssistantExecutorImpl("google-antigravity", file)
    expect(result).toEqual({ ok: true })
    expect(await readAssistantExecutorIdImpl(file)).toBe("google-antigravity")
    const view = await readVoiceSettingsViewImpl(file)
    expect(view.assistantExecutorId).toBe("google-antigravity")
  })

  it("refuses an unknown executor ID", async () => {
    const result = await saveAssistantExecutorImpl("unknown-executor", file)
    expect(result).toEqual({ ok: false, message: "Unknown AI executor" })
  })

  it("preserves provider, apiKey, and persona when executor is saved", async () => {
    const PERSONA = { assistantName: "Jarvis", userName: "Sam", spokenLanguage: "en-US", replyLanguage: "en-US", voiceURI: "" }
    await saveVoiceSettingsImpl({ providerId: "deepgram", apiKey: "secret-key" }, file)
    await saveAssistantPersonaImpl(PERSONA, file)
    await saveAssistantExecutorImpl("kiro", file)

    const settings = await readVoiceSettingsImpl(file)
    expect(settings.providerId).toBe("deepgram")
    expect(settings.apiKey).toBe("secret-key")
    expect(settings.persona).toEqual(PERSONA)
    expect(settings.assistantExecutorId).toBe("kiro")
  })
})

describe("readVoiceSettingsViewImpl", () => {
  it("reports that a key exists without ever returning it", async () => {
    await saveVoiceSettingsImpl({ providerId: "deepgram", apiKey: "dg-secret" }, file)
    const view = await readVoiceSettingsViewImpl(file)
    expect(view).toEqual({ providerId: "deepgram", hasKey: true, persona: null, assistantExecutorId: "claude-code", elevenlabsAgentReady: false, elevenlabsAgentOutdated: false, elevenlabsVoiceId: null, autoDispatchCompanies: [] })
    // The whole point: a secret rendered back into the DOM is a secret in
    // every screenshot and every screen-share.
    expect(JSON.stringify(view)).not.toContain("dg-secret")
  })

  it("reports no key when none is set", async () => {
    expect(await readVoiceSettingsViewImpl(file)).toEqual({
      providerId: "browser",
      hasKey: false,
      persona: null,
      assistantExecutorId: "claude-code",
      elevenlabsAgentReady: false,
      elevenlabsAgentOutdated: false,
      elevenlabsVoiceId: null,
      autoDispatchCompanies: [],
    })
  })

  it("never writes the key into the file in plaintext alongside anything else unexpected", async () => {
    await saveVoiceSettingsImpl({ providerId: "deepgram", apiKey: "dg-secret" }, file)
    const parsed = JSON.parse(await readFile(file, "utf-8"))
    expect(Object.keys(parsed).sort()).toEqual(["apiKey", "providerId"])
  })
})

describe("saveAutoDispatchImpl", () => {
  it("is empty by default, in the file and in the view", async () => {
    expect((await readVoiceSettingsImpl(file)).autoDispatchCompanies).toBeUndefined()
    expect((await readVoiceSettingsViewImpl(file)).autoDispatchCompanies).toEqual([])
  })

  it("turns a company on and off, and a later save of something else keeps the list", async () => {
    expect(await saveAutoDispatchImpl("acme", true, file)).toEqual({ ok: true })
    expect(await saveAutoDispatchImpl("acme", true, file)).toEqual({ ok: true })
    expect((await readVoiceSettingsImpl(file)).autoDispatchCompanies).toEqual(["acme"])
    await saveAutoDispatchImpl("beta", true, file)
    await saveAssistantExecutorImpl("claude-code", file)
    await saveVoiceSettingsImpl({ providerId: "browser" }, file)
    expect((await readVoiceSettingsViewImpl(file)).autoDispatchCompanies).toEqual(["acme", "beta"])
    await saveAutoDispatchImpl("acme", false, file)
    expect((await readVoiceSettingsViewImpl(file)).autoDispatchCompanies).toEqual(["beta"])
    await saveAutoDispatchImpl("beta", false, file)
    expect((await readVoiceSettingsViewImpl(file)).autoDispatchCompanies).toEqual([])
    expect("autoDispatchCompanies" in JSON.parse(await readFile(file, "utf-8"))).toBe(false)
  })

  it("refuses an empty, oversized or control-character id", async () => {
    for (const id of ["", "x".repeat(129), "a\nb"]) {
      expect(await saveAutoDispatchImpl(id, true, file)).toEqual({ ok: false, message: "Unknown company" })
    }
    expect((await readVoiceSettingsImpl(file)).autoDispatchCompanies).toBeUndefined()
  })

  it("ignores junk in the saved list when reading", async () => {
    await writeFile(
      file,
      JSON.stringify({ providerId: "browser", autoDispatchCompanies: ["a", 3, "", null, "a", "b"] }),
      "utf-8"
    )
    expect((await readVoiceSettingsImpl(file)).autoDispatchCompanies).toEqual(["a", "b"])
  })
})
