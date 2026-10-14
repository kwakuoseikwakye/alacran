"use client"

import { useEffect, useId, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ASSISTANT_LANGUAGES, DEFAULT_ASSISTANT_LANGUAGE } from "@/lib/assistant/languages"
import { MAX_PERSONA_NAME_LENGTH, type AssistantPersona } from "@/lib/assistant/persona"
import {
  cancelSpeech,
  isNoveltyVoice,
  pickVoice,
  sortVoicesByQuality,
  subscribeToVoices,
  voicesForLanguage,
} from "@/lib/speech"
import { saveAssistantPersona } from "@/lib/voice/voice-actions"

/**
 * First-run setup for the assistant, and the same four fields again in
 * Settings once it's done.
 *
 * **One form, two frames.** The overlay below is the frame the assistant page
 * puts around it; Settings renders the bare form. A second copy of four inputs
 * whose values must agree with the prompt builder is exactly the drift v86
 * describes — the fix there was one file, and it is one file here.
 *
 * A value import from `lib/assistant/persona` is safe from a client component
 * because that module is deliberately isomorphic; the module that READS and
 * WRITES this on disk is `lib/voice/settings-impl`, which is not.
 */
export function PersonaForm({
  initial,
  submitLabel = "Save",
  onSaved,
}: {
  initial: AssistantPersona | null
  submitLabel?: string
  onSaved?: (persona: AssistantPersona) => void
}) {
  const ids = useId()
  const [assistantName, setAssistantName] = useState(initial?.assistantName ?? "")
  const [userName, setUserName] = useState(initial?.userName ?? "")
  const [spokenLanguage, setSpokenLanguage] = useState(initial?.spokenLanguage ?? DEFAULT_ASSISTANT_LANGUAGE)
  const [replyLanguage, setReplyLanguage] = useState(initial?.replyLanguage ?? DEFAULT_ASSISTANT_LANGUAGE)
  const [voiceURI, setVoiceURI] = useState(initial?.voiceURI ?? "")
  const [status, setStatus] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  /**
   * Subscribed rather than read once: `getVoices()` is empty until the engine
   * populates it, so a picker built from a single synchronous read renders
   * empty on a cold page and never recovers.
   */
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  useEffect(() => subscribeToVoices(setVoices), [])
  useEffect(() => () => cancelSpeech(), [])

  const inLanguage = voicesForLanguage(voices, replyLanguage)
  // Falling back to every installed voice matters on machines whose only voices
  // are for other languages — an empty picker would read as a broken control
  // rather than as "nothing here speaks Portuguese".
  //
  // Best first rather than alphabetical, which is what put Albert — a joke
  // voice — at the top of 28 en-US options and got it picked. Same scoring the
  // automatic choice uses, so the top of this list and "Choose automatically"
  // cannot disagree.
  const options = sortVoicesByQuality(inLanguage.length > 0 ? inLanguage : voices, replyLanguage)

  /**
   * A saved gimmick voice is shown as "Choose automatically", because that is
   * what will actually be heard — `pickVoice` re-picks one rather than
   * honouring it. Leaving "Albert" selected in the form while Samantha reads
   * the answers would be a control that lies about its own effect.
   *
   * In an effect, not in `useState`: the voice list is empty on mount, so
   * whether the saved URI names a novelty voice is unknowable until it loads.
   * Clearing it here also means the next Save persists the repair.
   */
  useEffect(() => {
    if (!voiceURI) return
    const saved = voices.find((voice) => voice.voiceURI === voiceURI)
    if (saved && isNoveltyVoice(saved)) setVoiceURI("")
  }, [voices, voiceURI])

  /**
   * The one honest answer to "can't you find better ones" that costs nothing
   * and sends nothing anywhere: Apple's neural voices are free, offline, and
   * simply not installed by default. Only the download is out of reach.
   *
   * Detected in an effect, never during render — the same rule `hasEngine` and
   * `canListen` follow. The server has no `navigator`, so reading it inline
   * renders the hint on one side and not the other, which is a hydration
   * mismatch (React #418) rather than a one-frame flash.
   */
  const [onMac, setOnMac] = useState(false)
  useEffect(() => setOnMac(navigator.userAgent.includes("Mac")), [])

  const preview = () => {
    const voice = pickVoice(voices, voiceURI, replyLanguage)
    if (!voice) return
    cancelSpeech()
    const utterance = new SpeechSynthesisUtterance(
      assistantName.trim() ? `Hello ${userName.trim() || "there"}, I'm ${assistantName.trim()}.` : "Hello, this is my voice."
    )
    utterance.voice = voice
    utterance.lang = voice.lang
    window.speechSynthesis.speak(utterance)
  }
  /** Until someone picks a reply language on purpose, it follows the one they
   *  speak — "answer me in the language I asked in" is what almost everyone
   *  means, and the two-way choice is for the minority who don't. */
  const replyTouched = useRef(Boolean(initial && initial.replyLanguage !== initial.spokenLanguage))

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setStatus(null)
    const result = await saveAssistantPersona({ assistantName, userName, spokenLanguage, replyLanguage, voiceURI })
    setSaving(false)
    if (!result.ok) {
      setStatus(result.message)
      return
    }
    setStatus("Saved.")
    onSaved?.(result.persona)
  }

  return (
    <form className="asst-setup-form" onSubmit={submit}>
      <div className="asst-setup-field">
        <label htmlFor={`${ids}-assistant`}>What do you want to call me?</label>
        <input
          id={`${ids}-assistant`}
          value={assistantName}
          onChange={(event) => setAssistantName(event.target.value)}
          maxLength={MAX_PERSONA_NAME_LENGTH}
          placeholder="Jarvis"
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      <div className="asst-setup-field">
        <label htmlFor={`${ids}-user`}>And what should I call you?</label>
        <input
          id={`${ids}-user`}
          value={userName}
          onChange={(event) => setUserName(event.target.value)}
          maxLength={MAX_PERSONA_NAME_LENGTH}
          placeholder="Your name"
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      <div className="asst-setup-row">
        <div className="asst-setup-field">
          <label htmlFor={`${ids}-spoken`}>You&rsquo;ll speak</label>
          <select
            id={`${ids}-spoken`}
            value={spokenLanguage}
            onChange={(event) => {
              setSpokenLanguage(event.target.value)
              if (!replyTouched.current) setReplyLanguage(event.target.value)
            }}
          >
            {ASSISTANT_LANGUAGES.map((language) => (
              <option key={language.code} value={language.code} className="bg-os-surface text-os-text">
                {language.label}
              </option>
            ))}
          </select>
        </div>

        <div className="asst-setup-field">
          <label htmlFor={`${ids}-reply`}>I&rsquo;ll answer in</label>
          <select
            id={`${ids}-reply`}
            value={replyLanguage}
            onChange={(event) => {
              replyTouched.current = true
              setReplyLanguage(event.target.value)
            }}
          >
            {ASSISTANT_LANGUAGES.map((language) => (
              <option key={language.code} value={language.code} className="bg-os-surface text-os-text">
                {language.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="asst-setup-field">
        <label htmlFor={`${ids}-voice`}>My voice</label>
        <div className="asst-setup-voice">
          <select
            id={`${ids}-voice`}
            value={voiceURI}
            onChange={(event) => setVoiceURI(event.target.value)}
            disabled={voices.length === 0}
          >
            {/* Empty is a real choice, not a placeholder: it means "pick a
                sensible one for whatever language I'm answering in", which is
                the right default on a machine whose voices may change. */}
            <option value="" className="bg-os-surface text-os-text">
              {voices.length === 0 ? "Loading voices…" : "Choose automatically"}
            </option>
            {options.map((voice) => (
              <option key={voice.voiceURI} value={voice.voiceURI} className="bg-os-surface text-os-text">
                {voice.name} ({voice.lang})
                {/* macOS ships 19 of these and gives them no flag of their
                    own, so the only way to warn is in the label. */}
                {isNoveltyVoice(voice) ? " · sound effect" : ""}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="asst-setup-preview"
            onClick={preview}
            disabled={voices.length === 0}
            title="Hear this voice"
          >
            Preview
          </button>
        </div>
        {onMac && (
          <p className="asst-setup-hint">
            Want a better one? macOS has free high-quality voices it does not install by default.{" "}
            <a href="x-apple.systempreferences:com.apple.preference.universalaccess" target="_blank" rel="noreferrer">
              Open Accessibility settings
            </a>{" "}
            → Spoken Content → System Voice → Manage Voices, then pick any marked Premium or Enhanced. They show up
            here once downloaded.
          </p>
        )}
      </div>

      <div className="asst-setup-actions">
        <button type="submit" className="asst-setup-save" disabled={saving}>
          {saving ? "Saving…" : submitLabel}
        </button>
        {status && <span className="asst-setup-status">{status}</span>}
      </div>
    </form>
  )
}

/**
 * The frame the assistant page shows before its first use.
 *
 * Rendered INSIDE `.asst-stage` rather than instead of it, so the orb, the grid
 * and the bloom are the first thing seen and the setup card sits on top of
 * them — the page still introduces itself as what it is. `router.refresh()` on
 * save is what dismisses it: the page is `force-dynamic` and reads the persona
 * server-side, so re-rendering is the whole state transition.
 */
export function AssistantSetup({ initial }: { initial: AssistantPersona | null }) {
  const router = useRouter()
  return (
    <div className="asst-setup-scrim" role="dialog" aria-modal="true" aria-labelledby="asst-setup-title">
      <div className="asst-setup-card">
        <p className="asst-setup-kicker">First run</p>
        <h2 className="asst-setup-title" id="asst-setup-title">
          Before we start talking
        </h2>
        <p className="asst-setup-lede">
          Four quick things, so I know who I am and who I&rsquo;m speaking to. You can change any of them later in
          Settings.
        </p>
        <PersonaForm initial={initial} submitLabel="Start talking" onSaved={() => router.refresh()} />
        <SkipSetupButton onSaved={() => router.refresh()} />
        <p className="asst-setup-foot">
          I only ever answer questions here — I can&rsquo;t change a file, send anything, or spend anything, and
          I&rsquo;ll say so rather than pretend otherwise.
        </p>
      </div>
    </div>
  )
}

/**
 * These four questions stood between a new user and their first answer, with
 * no way past them. Skipping saves the defaults, which Settings can change.
 */
function SkipSetupButton({ onSaved }: { onSaved: () => void }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const skip = async () => {
    setSaving(true)
    const result = await saveAssistantPersona({
      assistantName: "Alacrán",
      userName: "",
      spokenLanguage: DEFAULT_ASSISTANT_LANGUAGE,
      replyLanguage: DEFAULT_ASSISTANT_LANGUAGE,
      voiceURI: "",
    })
    setSaving(false)
    if (!result.ok) {
      setError(result.message)
      return
    }
    onSaved()
  }
  return (
    <p className="asst-setup-foot">
      <button type="button" onClick={() => void skip()} disabled={saving} className="underline underline-offset-4">
        {saving ? "Saving…" : "Skip for now and use the defaults"}
      </button>
      {error && <span className="ml-2">{error}</span>}
    </p>
  )
}
