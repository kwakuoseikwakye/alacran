/**
 * Who does the listening and the speaking on the assistant page.
 *
 * Modelled on `AI_EXECUTORS`: a registry of capabilities with honest flags,
 * so a surface can ask "can this one transcribe?" instead of hardcoding a
 * vendor. Adding a provider is one entry here plus its client adapter.
 *
 * **`network` is the load-bearing field.** Alacrán's README carries a
 * "complete list of what actually leaves your machine", and voice is the first
 * feature that sends a MICROPHONE somewhere. Every provider must state its
 * real destination in words a non-technical user can act on, and the UI shows
 * that string at the point of choosing. A provider added without an honest
 * `network` line silently makes that README section false.
 */

export type VoiceProviderId = "browser" | "deepgram" | "elevenlabs"

export type VoiceProvider = {
  id: VoiceProviderId
  label: string
  /** Speech in. */
  stt: boolean
  /** Speech out. Absent means the page falls back to the browser's own
   *  `speechSynthesis`, which needs no key and works offline. */
  tts: boolean
  /** Needs a key the user pastes in Settings. */
  needsKey: boolean
  /** Where a user gets that key, shown beside the field. */
  keyHint?: string
  keyLink?: string
  /**
   * Exactly where audio goes, in the user's own terms. Rendered in Settings
   * and mirrored into README.md's privacy list — keep the two saying the same
   * thing.
   */
  network: string
  /** Real, measured limitations, in the user's terms — never "unverified",
   *  which is a reason to go and check rather than a caveat to ship. */
  limitations?: string[]
}

export const VOICE_PROVIDERS: Record<VoiceProviderId, VoiceProvider> = {
  browser: {
    id: "browser",
    label: "This computer's browser engine",
    stt: true,
    tts: true,
    needsKey: false,
    // Stated plainly because it is the single most surprising thing about the
    // default: the Web Speech API is NOT on-device in Chromium. It streams
    // microphone audio to Google's speech service. That is a third party the
    // user never chose, which is exactly why it has to be said here and in
    // README.md rather than left as an implementation detail.
    network: "Your voice is sent to Google's speech service, because that is what this browser engine uses to transcribe. Nothing is stored by Alacrán.",
    limitations: [
      "Works in a Chrome or Edge browser tab.",
      // Measured 2026-09-07 against Electron 42.10.1, the framework version the
      // packaged Alacrán app embeds, with the microphone granted: the
      // microphone really opens and the speech service then refuses. The
      // window has every control and nothing behind them, which is why this
      // says so in the user's own terms instead of "unverified".
      "Does not work in the Alacrán desktop app on macOS. That window opens your microphone and never returns a word, because it has no speech service behind it — use Deepgram there, or type your question.",
      "On the Linux build there is no speech engine at all — you can still type.",
      "Needs an internet connection.",
    ],
  },
  deepgram: {
    id: "deepgram",
    label: "Deepgram (your own account)",
    stt: true,
    // Deepgram does have a TTS product, but this app doesn't use it: spoken
    // replies go through the browser's own `speechSynthesis`, which is free,
    // needs no key, and keeps the reply on the machine. Adding a second paid
    // call to speak a sentence the computer can already say is not worth it.
    tts: false,
    needsKey: true,
    // Says which KIND of key up front, because the failure it prevents is
    // invisible until you speak: a lower-rights key passes every check you can
    // make by eye — it is the right length, the console accepts it, and it can
    // transcribe — but cannot mint the short-lived pass this app swaps it for,
    // so the orb refuses with a permissions error and the key looks broken.
    keyHint: "Create a key in the Deepgram console with Owner or Admin rights, then paste it here. A lower-rights key is accepted here but can't start a session.",
    keyLink: "https://console.deepgram.com/",
    network:
      "Your voice is sent to Deepgram using your own account. Your key never leaves this computer — Alacrán swaps it for a short-lived pass each time you speak.",
    limitations: [
      "Deepgram is a paid service, billed to your own account.",
      "Spoken replies still use this computer's own voice, which needs no account.",
    ],
  },
  elevenlabs: {
    id: "elevenlabs",
    label: "ElevenLabs agent (your own account)",
    stt: true,
    tts: true,
    needsKey: true,
    keyHint:
      "Create an API key in your ElevenLabs account that is allowed to use Agents, then paste it here. Alacrán creates the agent for you.",
    keyLink: "https://elevenlabs.io/app/settings/api-keys",
    network:
      "Your voice and the conversation go to ElevenLabs, and to the AI model you let their agent use. The agent Alacrán creates lives in your ElevenLabs account and keeps the assistant's name, your name, the languages you chose and the assistant's behaviour instructions there; your first name is spoken in its greeting. When you ask about your company, the answer from your own AI on this computer is sent to ElevenLabs so it can speak it. Your key goes only to ElevenLabs, sent from this computer's own server to set up your agent and start each call — it is never put in the app window. The window only receives a call link made for each call.",
    limitations: [
      "ElevenLabs is a paid service, billed to your own account by the minute of conversation.",
      "A call ends by itself after 2 minutes of silence or at the longest call length you set (10 minutes unless you change it), and closing the assistant panel ends it too.",
    ],
  },
}

export const DEFAULT_VOICE_PROVIDER: VoiceProviderId = "browser"

export function getVoiceProvider(id: string | undefined): VoiceProvider {
  if (id && id in VOICE_PROVIDERS) return VOICE_PROVIDERS[id as VoiceProviderId]
  return VOICE_PROVIDERS[DEFAULT_VOICE_PROVIDER]
}

export function listVoiceProviders(): VoiceProvider[] {
  return Object.values(VOICE_PROVIDERS)
}
