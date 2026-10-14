"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { askAllCompanies } from "@/lib/assistant/ask-all-companies"
import { askCompany } from "@/lib/ask-company"
import { asEnvelopeResult } from "@/lib/assistant/voice-envelope"
import {
  ASSISTANT_LANGUAGES,
  DEFAULT_ASSISTANT_LANGUAGE,
  languageName,
  needsTranslation,
} from "@/lib/assistant/languages"
import {
  cancelSpeech,
  classifySpeechError,
  getSpeechRecognition,
  markSpeechEngineBroken,
  pickVoice,
  speechFailureMessage,
  subscribeToVoices,
  type SpeechRecognitionLike,
} from "@/lib/speech"
import { mintDeepgramGrant, saveAssistantExecutor } from "@/lib/voice/voice-actions"
import { desktopMic, micResetMessage, type DesktopMic } from "@/lib/voice/desktop-mic"
import { useMicEnabled } from "@/lib/voice/mic-preference"
import { useClapWake } from "@/lib/voice/clap-preference"
import { useClapListener } from "./use-clap-listener"
import { startDeepgramCapture, type CaptureHandle } from "@/lib/voice/deepgram-capture"
import { AssistantSetup } from "./persona-setup"
import type { AssistantPersona } from "@/lib/assistant/persona"
import type { VoiceProviderId } from "@/lib/voice/providers"
import {
  listAiExecutors,
  DEFAULT_AI_EXECUTOR_ID,
  type AiExecutorId,
} from "@/lib/ai-executors"

import { parseActionProposal, type ActionProposal } from "@/lib/assistant/action-envelope"
import { ProposalCard } from "./proposal-card"
import { HumanoidAvatar } from "./humanoid-avatar"
import { Sparkles, Volume2, VolumeX, Mic, ArrowUp, X } from "lucide-react"

export const ALL_COMPANIES = "all"
export type AssistantCompany = { id: string; name: string }

type Mode = "idle" | "listening" | "thinking" | "speaking"
type Turn = { role: "you" | "assistant"; text: string; sub: string; proposal?: ActionProposal | null }

const STATUS: Record<Mode, string> = {
  idle: "Standing by",
  listening: "Listening",
  thinking: "Working",
  speaking: "Speaking",
}

/** The level above which the meter counts as having heard a real voice rather
 *  than a room. Matches the capture module's own dead-channel floor, so the
 *  two agree about what silence is. */
const MIC_FLOOR = 0.01
const CLAP_WAITING = "Waiting for a double clap — or press the core."

/** The design's three suggestions, generalised so they mean something on any machine. */
const SUGGESTIONS = ["What ran overnight?", "What did we decide recently?", "Which jobs are waiting on me?"]

/**
 * The voice HUD & Assistant drawer interface.
 */
export function AssistantStage({
  companies,
  voiceProviderId = "browser",
  voiceReady = true,
  persona = null,
  initialExecutorId = DEFAULT_AI_EXECUTOR_ID,
  initialPrompt = "",
  initialScope = ALL_COMPANIES,
  onInitialPromptUsed,
  onClose,
}: {
  companies: AssistantCompany[]
  voiceProviderId?: VoiceProviderId
  voiceReady?: boolean
  persona?: AssistantPersona | null
  initialExecutorId?: AiExecutorId
  initialScope?: string
  initialPrompt?: string
  /** Called once `initialPrompt` has been sent, so a later remount does not
   *  ask the same question twice. */
  onInitialPromptUsed?: () => void
  onClose?: () => void
}) {
  const needsSetup = persona === null
  const [mode, setMode] = useState<Mode>("idle")
  // The ref decides what the callbacks do; this mirror exists so a stop is something a render can see
  // (the clap listener turns on and off with it).
  const [manualStop, setManualStop] = useState(false)
  const [lines, setLines] = useState<Turn[]>([])
  const [historyReady, setHistoryReady] = useState(false)
  const historyKey = `alacran.conversation.${initialScope}`
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(historyKey) ?? "[]")
      if (Array.isArray(saved)) setLines(saved.filter((line) => (line.role === "you" || line.role === "assistant") && typeof line.text === "string").slice(-100).map((line) => ({ role: line.role, text: line.text, sub: typeof line.sub === "string" ? line.sub : "" })))
    } catch { /* No saved conversation yet. */ }
    setHistoryReady(true)
  }, [historyKey])
  useEffect(() => {
    if (!historyReady) return
    try {
      // Executable proposals are deliberately not replayed from saved history.
      // Prepared documents remain available through Approvals.
      localStorage.setItem(historyKey, JSON.stringify(lines.slice(-100).map(({ role, text, sub }) => ({ role, text, sub }))))
    } catch { /* Storage may be full or disabled. */ }
  }, [historyKey, historyReady, lines])
  const [lang, setLang] = useState(persona?.spokenLanguage ?? DEFAULT_ASSISTANT_LANGUAGE)
  const [executorId, setExecutorId] = useState<AiExecutorId>(initialExecutorId)
  const [caption, setCaption] = useState("")
  const [sub, setSub] = useState("")
  const [voiceOn, setVoiceOn] = useState(true)
  const [scope, setScope] = useState<string>(initialScope)
  useEffect(() => { setScope(initialScope) }, [initialScope])
  const replyLanguage = persona?.replyLanguage ?? DEFAULT_ASSISTANT_LANGUAGE
  // Detected in an effect, never during render: the server has no `window`, so
  // computing this inline renders a different tree on each side. Same trap the
  // per-company Sheet hid and the permanent page exposes.
  const [hasEngine, setHasEngine] = useState(true)
  const [calm, setCalm] = useState(false)
  /** The mac shell's microphone bridge, or null everywhere else. Detected in
   *  an effect for the same reason `hasEngine` is: the server has no `window`,
   *  so reading it during render renders a footer with a button on one side
   *  and without one on the other. */
  const [mic, setMic] = useState<DesktopMic | null>(null)
  const [micNote, setMicNote] = useState("")
  /** The typed question. Always available, whatever the microphone is doing. */
  const [typed, setTyped] = useState("")
  const typedRef = useRef<HTMLInputElement | null>(null)
  const [micBusy, setMicBusy] = useState(false)
  const logRef = useRef<HTMLDivElement | null>(null)
  const recRef = useRef<SpeechRecognitionLike | null>(null)
  const captureRef = useRef<CaptureHandle | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const acRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  // Explicitly backed by an ArrayBuffer: since TS 5.7 `Uint8Array` is generic
  // over its buffer, and lib.dom's getByteFrequencyData accepts only the
  // ArrayBuffer form — a bare `Uint8Array` widens to ArrayBufferLike (which
  // admits SharedArrayBuffer) and does not match.
  const freqRef = useRef<Uint8Array<ArrayBuffer> | null>(null)
  const lvlRef = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)
  // The loop reads these without being torn down and rebuilt every time they
  // change — a rAF loop that restarts on each state change is a stutter.
  const modeRef = useRef<Mode>("idle")
  const calmRef = useRef(false)
  const busyRef = useRef(false)
  /** Has real sound crossed the floor since listening began? Written by the
   *  rAF loop, which is already reading the analyser every frame — a second
   *  reader would be a second thing to keep in step. */
  const heardSoundRef = useRef(false)
  /** The live input meter. Driven by ref like everything else on the orb: a
   *  bar that re-rendered the tree 60 times a second would stutter the very
   *  animation it exists to provide. */
  const levelBarRef = useRef<HTMLDivElement | null>(null)
  /** A ref, not state: the voice list is read at the moment of speaking and
   *  nothing renders from it, so a re-render on `voiceschanged` would be a
   *  repaint for no visible reason. */
  const voicesRef = useRef<SpeechSynthesisVoice[]>([])

  const manualStopRef = useRef(false)
  const isMountedRef = useRef(true)
  const isPageVisibleRef = useRef(true)
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const accumulatedFinalRef = useRef("")
  const startListeningRef = useRef<(() => Promise<void>) | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  /** Preferences › Voice. Off means the microphone is never opened — not on
   *  mount, not on a visit, not on the space bar. Read through a ref so the
   *  listening callbacks keep their identity when it flips. */
  const micEnabled = useMicEnabled()
  const micEnabledRef = useRef(false)

  useEffect(() => {
    modeRef.current = mode
  }, [mode])
  useEffect(() => {
    calmRef.current = calm
  }, [calm])

  /**
   * Can this window listen at all, right now?
   *
   * Deepgram is a plain WebSocket, so it works wherever the app runs. The
   * browser engine needs its constructor to be present AND to not have already
   * failed at use time — `getSpeechRecognition()` covers both, which is why
   * this is not a truthiness check on `window.webkitSpeechRecognition`.
   */
  const canListenHere = useCallback(
    () => voiceProviderId === "deepgram" || getSpeechRecognition() !== undefined,
    [voiceProviderId]
  )

  // In an effect, never during render: the server has no `window`, and
  // computing it inline renders a different tree on each side.
  useEffect(() => {
    setHasEngine(canListenHere())
  }, [canListenHere])

  useEffect(() => setMic(desktopMic()), [])

  /** Always offered inside the mac shell, never gated on a status read — the
   *  case this exists for is a filed "granted" that delivers silence, so a
   *  status check would hide the button from exactly the people who need it.
   *  See lib/voice/desktop-mic.ts. */
  const resetMic = useCallback(async () => {
    if (!mic) return
    setMicBusy(true)
    setMicNote("Asking macOS…")
    try {
      const { status } = await mic.force()
      setMicNote(micResetMessage(status))
    } catch {
      setMicNote("Couldn't reach macOS. Quit Alacrán, open it again, then try once more.")
    } finally {
      setMicBusy(false)
    }
  }, [mic])

  // Kept warm from mount so the very first answer of a session has the same
  // list to choose from as every answer after it.
  useEffect(
    () =>
      subscribeToVoices((next) => {
        voicesRef.current = next
      }),
    []
  )

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)")
    const sync = () => setCalm(query.matches)
    sync()
    query.addEventListener("change", sync)
    return () => query.removeEventListener("change", sync)
  }, [])

  const closeMic = useCallback(() => {
    // Both capture paths release here: the Deepgram one owns its own
    // AudioContext and socket, the browser one only a MediaStream.
    captureRef.current?.stop()
    captureRef.current = null
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    analyserRef.current = null
  }, [])

  const stopAll = useCallback(() => {
    manualStopRef.current = true
    setManualStop(true)
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    if (resumeTimerRef.current) {
      clearTimeout(resumeTimerRef.current)
      resumeTimerRef.current = null
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
    accumulatedFinalRef.current = ""
    try {
      recRef.current?.stop()
    } catch {
      /* already stopped */
    }
    cancelSpeech()
    closeMic()
    setMode("idle")
    setSub("")
  }, [closeMic])

  const muteAndStop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }
    if (resumeTimerRef.current) {
      clearTimeout(resumeTimerRef.current)
      resumeTimerRef.current = null
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
    accumulatedFinalRef.current = ""
    try {
      recRef.current?.stop()
    } catch {
      /* already stopped */
    }
    cancelSpeech()
    closeMic()
    setMode((current) => (current === "listening" || current === "speaking" ? "idle" : current))
    setSub("")
  }, [closeMic])

  useEffect(() => {
    micEnabledRef.current = micEnabled
    // Switched off mid-sentence: release the microphone now, not on the next press.
    if (!micEnabled && modeRef.current === "listening") stopAll()
  }, [micEnabled, stopAll])

  /* -------------------------------------------------------- the humanoid avatar */
  useEffect(() => {
    const step = () => {
      const current = modeRef.current
      let level: number
      const t = performance.now() / 1000

      if (current === "listening" && analyserRef.current) {
        const analyser = analyserRef.current
        // Allocated over an explicit ArrayBuffer: lib.dom's signature wants a
        // Uint8Array backed by one, and a bare `new Uint8Array(n)` widens to
        // ArrayBufferLike (which admits SharedArrayBuffer) and fails to match.
        const data =
          freqRef.current ?? (freqRef.current = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount)))
        analyser.getByteFrequencyData(data)
        let sum = 0
        for (let i = 0; i < 64; i++) sum += data[i]
        level = Math.min(1, sum / 64 / 86)
      } else if (current === "speaking") {
        level = 0.34 + 0.3 * Math.abs(Math.sin(t * 3.1)) + 0.16 * Math.abs(Math.sin(t * 7.7))
      } else if (current === "thinking") {
        level = 0.16 + 0.1 * Math.sin(t * 2.2)
      } else {
        // Reduced motion kills the IDLE shimmer only. The meter still responds
        // while listening or speaking, because there it is feedback about a
        // live device rather than decoration.
        level = calmRef.current ? 0 : 0.06 + 0.04 * Math.sin(t * 1.1)
      }

      lvlRef.current = lvlRef.current === null ? level : lvlRef.current + (level - lvlRef.current) * 0.28

      // Live input meter, and the record of whether anything was ever heard.
      // Both come off the raw `level` rather than the smoothed one: smoothing
      // exists to make the avatar pleasant, and a meter that lags the voice it is
      // reporting on is worse than no meter.
      if (current === "listening") {
        if (level > MIC_FLOOR) heardSoundRef.current = true
        if (levelBarRef.current) {
          levelBarRef.current.style.transform = `scaleX(${Math.min(1, 0.02 + level * 1.6).toFixed(3)})`
        }
      }

      rafRef.current = requestAnimationFrame(step)
    }
    rafRef.current = requestAnimationFrame(step)
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  /* --------------------------------------------------------------- the brain */
  const push = useCallback((turn: Turn) => {
    setLines((previous) => [...previous, turn])
  }, [])

  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines])

  const scheduleResumeListening = useCallback((delay = 400) => {
    if (manualStopRef.current) return
    // Nothing to resume into once the engine has proved itself dead — and
    // without this the auto-resume would paint "no working speech engine" over
    // the answer the user just got, every single time.
    if (!canListenHere()) return
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current)
    resumeTimerRef.current = setTimeout(() => {
      if (
        !manualStopRef.current &&
        modeRef.current === "idle" &&
        isMountedRef.current &&
        isPageVisibleRef.current
      ) {
        void startListeningRef.current?.()
      }
    }, delay)
  }, [canListenHere])

  const createUtterance = useCallback(
    (text: string, onEndOrError: () => void) => {
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = replyLanguage
      utterance.rate = 1
      utterance.pitch = 0.95
      const preferred = pickVoice(voicesRef.current, persona?.voiceURI, replyLanguage)
      if (preferred) {
        utterance.voice = preferred
        utterance.lang = preferred.lang
      }
      utterance.onend = onEndOrError
      utterance.onerror = onEndOrError
      return utterance
    },
    [persona?.voiceURI, replyLanguage]
  )

  const speak = useCallback(
    (text: string, heard: string) => {
      if (!isMountedRef.current || !isPageVisibleRef.current) {
        cancelSpeech()
        return
      }
      const tail = heard ? `“${heard}”` : ""
      if (!voiceOn || typeof window === "undefined" || !window.speechSynthesis) {
        setMode("idle")
        setCaption(text)
        setSub(tail || "Spoken replies off")
        scheduleResumeListening(1500)
        return
      }
      const finishSpeaking = () => {
        if (!isMountedRef.current || !isPageVisibleRef.current) return
        setMode("idle")
        setSub(tail)
        scheduleResumeListening(400)
      }
      const utterance = createUtterance(text, finishSpeaking)
      setMode("speaking")
      setCaption(text)
      setSub("Speaking…")
      window.speechSynthesis.cancel()
      window.speechSynthesis.speak(utterance)
    },
    [createUtterance, scheduleResumeListening, voiceOn]
  )

  const ask = useCallback(
    async (question: string, spokenIn: string | undefined, requestedScope = scope) => {
      if (busyRef.current) return
      busyRef.current = true
      setMode("thinking")
      setCaption(question)
      setSub("Thinking…")

      const abortController = new AbortController()
      abortControllerRef.current = abortController

      let streamFailed = false
      let fullRaw = ""
      let sentenceBuffer = ""
      let queuedUtteranceCount = 0
      let completedUtteranceCount = 0
      let streamFinished = false
      let heard = ""
      let usageNote = ""

      const checkAllSpoken = () => {
        if (!isMountedRef.current || !isPageVisibleRef.current) return
        if (streamFinished && queuedUtteranceCount === completedUtteranceCount) {
          setMode("idle")
          setSub(heard ? `“${heard}”` : "")
          scheduleResumeListening(400)
        }
      }

      const queueSentence = (sentence: string) => {
        if (!voiceOn || typeof window === "undefined" || !window.speechSynthesis) return
        if (!isMountedRef.current || !isPageVisibleRef.current) return

        if (queuedUtteranceCount === 0) {
          window.speechSynthesis.cancel()
          setMode("speaking")
          setSub("Speaking…")
        }
        queuedUtteranceCount++
        const utterance = createUtterance(sentence, () => {
          completedUtteranceCount++
          checkAllSpoken()
        })
        window.speechSynthesis.speak(utterance)
      }

      try {
        const response = await fetch("/api/assistant/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question,
            scope: requestedScope,
            spokenLanguage: spokenIn,
            executorId,
            page: window.location.pathname,
          }),
          signal: abortController.signal,
        })

        if (!response.ok || !response.body) {
          throw new Error(`HTTP ${response.status}`)
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder("utf-8")
        let sseBuffer = ""

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          sseBuffer += decoder.decode(value, { stream: true })
          const lines = sseBuffer.split("\n\n")
          sseBuffer = lines.pop() ?? ""

          for (const block of lines) {
            const trimmedBlock = block.trim()
            if (!trimmedBlock.startsWith("data:")) continue
            const dataStr = trimmedBlock.replace(/^data:\s*/, "")
            let event: { type: string; text?: string; message?: string; promptTokens?: number; local?: boolean }
            try {
              event = JSON.parse(dataStr)
            } catch {
              continue
            }

            if (event.type === "meta") {
              usageNote = event.local
                ? "answered on this computer · no AI used"
                : typeof event.promptTokens === "number"
                  ? `sent ~${formatTokens(event.promptTokens)} tokens to your AI`
                  : ""
              continue
            }
            if (event.type === "chunk" && event.text) {
              fullRaw += event.text

              if (!spokenIn) {
                // Live English query: update caption live and queue sentences as they finish
                const displaySpeech = fullRaw.replace(/<action_proposal[\s\S]*$/gi, "").trim()
                if (displaySpeech) {
                  setCaption(displaySpeech)
                  if (queuedUtteranceCount === 0) {
                    setSub("Responding…")
                  }
                }

                sentenceBuffer += event.text
                // Strip in-flight action proposals from sentence buffer so XML is never spoken
                const cleanBuffer = sentenceBuffer.replace(/<action_proposal[\s\S]*$/gi, "")
                if (cleanBuffer.length < sentenceBuffer.length) {
                  // An action proposal started; keep only text before it
                  sentenceBuffer = cleanBuffer
                }

                // Extract sentences ending in . ! or ? followed by whitespace
                while (true) {
                  const match = sentenceBuffer.match(/^([\s\S]*?[.!?]+)(?:\s+)([\s\S]*)$/)
                  if (!match) break
                  const sentence = match[1].trim()
                  sentenceBuffer = match[2]
                  if (sentence && !sentence.includes("<action_proposal")) {
                    queueSentence(sentence)
                  }
                }
              }
            } else if (event.type === "error") {
              throw new Error(event.message || "Streaming error")
            }
          }
        }

        // Stream completed
        streamFinished = true

        if (!isMountedRef.current || !isPageVisibleRef.current) {
          cancelSpeech()
          return
        }

        if (spokenIn) {
          // Unwrap voice envelope for foreign language
          const envelopeResult = asEnvelopeResult(fullRaw)
          if (envelopeResult.ok) {
            const { speech, proposal } = parseActionProposal(envelopeResult.answer)
            heard = envelopeResult.english && envelopeResult.english !== question ? envelopeResult.english : ""
            push({ role: "assistant", text: speech, sub: [heard ? `heard: ${heard}` : "", usageNote].filter(Boolean).join(" · "), proposal })
            speak(speech, heard)
            return
          }
        }

        // English stream completion: process any remaining sentence fragment in sentenceBuffer
        const remainingSentence = sentenceBuffer.replace(/<action_proposal[\s\S]*$/gi, "").trim()
        if (remainingSentence && !remainingSentence.includes("<action_proposal")) {
          queueSentence(remainingSentence)
        }

        const { speech, proposal } = parseActionProposal(fullRaw)
        push({ role: "assistant", text: speech, sub: usageNote, proposal })

        if (queuedUtteranceCount === 0) {
          // Voice was off or no sentences spoken
          setMode("idle")
          setCaption(speech)
          setSub(!voiceOn ? "Spoken replies off" : "")
          scheduleResumeListening(1500)
        } else {
          // Utterances were queued; check if they already finished
          checkAllSpoken()
        }
      } catch {
        if (abortController.signal.aborted) {
          // Aborted intentionally
          return
        }
        streamFailed = true
      } finally {
        abortControllerRef.current = null
      }

      // If streaming failed and we haven't started speaking, fallback to server action
      if (streamFailed && queuedUtteranceCount === 0) {
        try {
          const result =
            requestedScope === ALL_COMPANIES
              ? await askAllCompanies(question, spokenIn, executorId)
              : await askCompany(requestedScope, question, spokenIn, executorId)
          if (!isMountedRef.current || !isPageVisibleRef.current) {
            cancelSpeech()
            return
          }
          if (result.ok) {
            const { speech, proposal } = parseActionProposal(result.answer)
            const fallbackHeard = result.english && result.english !== question ? result.english : ""
            push({ role: "assistant", text: speech, sub: fallbackHeard ? `heard: ${fallbackHeard}` : "", proposal })
            speak(speech, fallbackHeard)
          } else {
            push({ role: "assistant", text: result.message, sub: "" })
            setMode("idle")
            setCaption(result.message)
            setSub("")
            scheduleResumeListening(2500)
          }
        } finally {
          busyRef.current = false
        }
      } else {
        busyRef.current = false
      }
    },
    [
      createUtterance,
      executorId,
      push,
      scheduleResumeListening,
      scope,
      speak,
      voiceOn,
    ]
  )

  // A question handed over from the Ask page is sent, not just typed into this
  // box: the user already pressed Enter once. Before first-run setup it is held
  // in the box instead; finishing setup remounts this stage and it goes then —
  // it used to be dropped, so the first question never got an answer.
  useEffect(() => {
    if (!initialPrompt) return
    setScope(initialScope)
    if (needsSetup) {
      setTyped(initialPrompt)
      return
    }
    // Deferred a tick and cancelled on cleanup, so it is sent exactly once:
    // React's development double-mount otherwise sent it twice, and the
    // unmount in between aborted the first send and left "Thinking…" forever.
    const timer = setTimeout(() => {
      manualStopRef.current = true
      setManualStop(true)
      push({ role: "you", text: initialPrompt, sub: "typed" })
      void ask(initialPrompt, needsTranslation(lang) ? languageName(lang) : undefined, initialScope)
      onInitialPromptUsed?.()
    }, 0)
    return () => clearTimeout(timer)
    // Once per handed-over prompt, not whenever `ask` or `lang` change identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt, initialScope])

  /* ------------------------------------------------------------- speech in */
  const openMic = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      try {
        sessionStorage.setItem("alacran_mic_granted", "true")
      } catch {
        /* ignore storage failure */
      }
      streamRef.current = stream
      const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ac = acRef.current ?? (acRef.current = new Ctx())
      if (ac.state === "suspended") await ac.resume()
      const analyser = ac.createAnalyser()
      analyser.fftSize = 512
      analyser.smoothingTimeConstant = 0.72
      ac.createMediaStreamSource(stream).connect(analyser)
      analyserRef.current = analyser
      freqRef.current = null
    } catch {
      // No mic, or permission refused. The orb falls back to its synthetic
      // level — the run is still perfectly usable, it just isn't metering.
    }
  }, [])

  /** Heard a complete utterance — identical for both providers, so the two
   *  capture paths differ only in how audio becomes text. */
  const onHeard = useCallback(
    (spoken: string) => {
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current)
        silenceTimerRef.current = null
      }
      accumulatedFinalRef.current = ""
      closeMic()
      push({ role: "you", text: spoken, sub: languageName(lang) })
      void ask(spoken, needsTranslation(lang) ? languageName(lang) : undefined)
    },
    [ask, closeMic, lang, push]
  )

  /** Deepgram: the app mints a short-lived grant server-side, then this window
   *  streams straight to Deepgram. Works in both packaged shells, unlike the
   *  browser engine. */
  const startDeepgram = useCallback(async () => {
    setMode("listening")
    setCaption("")
    setSub("Connecting…")
    heardSoundRef.current = false
    const handle = await startDeepgramCapture({
      // Minted from inside, once the capture graph's real sample rate is known
      // — a rate the socket only assumed before, which is unfalsifiable when
      // wrong (audio flows, transcripts come back empty, nothing errors).
      mintGrant: (sampleRate) => mintDeepgramGrant(lang, sampleRate),
      onInterim: (text) => {
        // Every interim, unfiltered — this is the live transcription, and the
        // whole point of it is to appear while the sentence is still being
        // said.
        setCaption(text)
        setSub("Hearing you…")
      },
      onFinal: onHeard,
      onUnclear: (text) => {
        setCaption(text)
        setSub("Didn't quite catch that — say it again?")
      },
      onError: (message) => {
        setMode("idle")
        setCaption(message)
        setSub("")
        closeMic()
      },
    })
    try {
      sessionStorage.setItem("alacran_mic_granted", "true")
    } catch {
      /* ignore */
    }
    if (!isMountedRef.current || !isPageVisibleRef.current || modeRef.current !== "listening") {
      handle.stop()
      return
    }
    captureRef.current = handle
    // The orb meters off Deepgram's own capture graph rather than opening a
    // second microphone stream of its own.
    analyserRef.current = handle.analyser
    freqRef.current = null
    if (handle.analyser) setSub(`Listening in ${languageName(lang)}…`)
  }, [closeMic, lang, onHeard])

  const startListening = useCallback(async () => {
    if (
      needsSetup ||
      !isMountedRef.current ||
      !isPageVisibleRef.current ||
      modeRef.current === "listening" ||
      modeRef.current === "thinking"
    )
      return
    manualStopRef.current = false
    setManualStop(false)
    if (resumeTimerRef.current) {
      clearTimeout(resumeTimerRef.current)
      resumeTimerRef.current = null
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
    accumulatedFinalRef.current = ""

    if (!micEnabledRef.current) {
      setCaption("The microphone is off.")
      setSub("Turn it on under Preferences › Voice — or type your question below.")
      return
    }

    if (!voiceReady) {
      setCaption("Voice needs a key before it can listen.")
      setSub("Add one under Settings › Voice — or type your question below.")
      return
    }

    if (voiceProviderId === "deepgram") {
      await startDeepgram()
      return
    }

    const Recognition = getSpeechRecognition()
    if (!Recognition) {
      // Either the constructor was never there, or this window already proved
      // at use time that nothing is behind it. Same dead end, same message.
      const { caption: noEngine, next } = speechFailureMessage("no-engine")
      setHasEngine(false)
      setCaption(noEngine)
      setSub(next)
      return
    }
    const recognition = new Recognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = lang
    recognition.onresult = (event) => {
      let interim = ""
      let final = ""
      for (let i = event.resultIndex ?? 0; i < event.results.length; i++) {
        const result = event.results[i] as ArrayLike<{ transcript: string }> & { isFinal?: boolean }
        const text = result[0]?.transcript ?? ""
        if (result.isFinal) final += (final ? " " : "") + text
        else interim += (interim ? " " : "") + text
      }
      if (final.trim()) {
        accumulatedFinalRef.current += (accumulatedFinalRef.current ? " " : "") + final.trim()
      }
      const liveText = (accumulatedFinalRef.current + (interim.trim() ? " " + interim.trim() : "")).trim()
      if (liveText) {
        setCaption(liveText)
        setSub("Hearing you…")
      }
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current)
        silenceTimerRef.current = null
      }
      if (liveText) {
        // Natural pause: wait 1000ms after user pauses before concluding the sentence
        silenceTimerRef.current = setTimeout(() => {
          const spoken = (accumulatedFinalRef.current || liveText).trim()
          if (spoken) {
            accumulatedFinalRef.current = ""
            try {
              recognition.stop()
            } catch {
              /* already stopping */
            }
            onHeard(spoken)
          }
        }, 1000)
      }
    }
    recognition.onerror = (event?: { error?: string }) => {
      const failure = classifySpeechError(event?.error)
      // Silence, or our own stop. Neither is worth a message; `onend` handles
      // whatever comes next.
      if (failure === "silence") return
      if (silenceTimerRef.current) {
        clearTimeout(silenceTimerRef.current)
        silenceTimerRef.current = null
      }
      accumulatedFinalRef.current = ""
      if (failure === "no-engine") {
        // The microphone opened and audio flowed — this is the speech SERVICE
        // refusing, which in the packaged mac shell it always does. Remember
        // it, so the next press says so up front instead of failing the same
        // way again, and so nothing auto-resumes into it.
        markSpeechEngineBroken()
        setHasEngine(false)
        manualStopRef.current = true
        setManualStop(true)
      }
      const { caption: failed, next } = speechFailureMessage(failure)
      setMode("idle")
      setCaption(failed)
      setSub(next)
      closeMic()
    }
    recognition.onend = () => {
      if (modeRef.current === "listening" && !manualStopRef.current) {
        if (accumulatedFinalRef.current.trim()) {
          const spoken = accumulatedFinalRef.current.trim()
          accumulatedFinalRef.current = ""
          onHeard(spoken)
        } else {
          try {
            recognition.start()
          } catch {
            setMode("idle")
            closeMic()
          }
        }
      } else {
        setMode((current) => (current === "listening" ? "idle" : current))
        closeMic()
      }
    }
    recRef.current = recognition
    setMode("listening")
    setCaption("")
    setSub(`Listening in ${languageName(lang)}…`)
    await openMic()
    try {
      recognition.start()
    } catch {
      /* already started */
    }
  }, [closeMic, lang, needsSetup, onHeard, openMic, startDeepgram, voiceProviderId, voiceReady])

  useEffect(() => {
    startListeningRef.current = startListening
  }, [startListening])

  /* ------------------------------------------------------------ double-clap wake */
  // "Asleep" is a state the person put the Assistant in (pressed stop, or typed instead of talking), not
  // an idle gap between turns. Only then, and only with BOTH switches on, is the microphone held open to
  // wait for a clap; the line below says so, because the system's own microphone indicator will be lit.
  const clapEnabled = useClapWake()
  const clapActive = clapEnabled && micEnabled && manualStop && mode === "idle" && !needsSetup && voiceReady
  const wakeOnClap = useCallback(() => {
    if (modeRef.current !== "idle") return
    manualStopRef.current = false
    setManualStop(false)
    void startListeningRef.current?.()
  }, [])
  useClapListener(clapActive, wakeOnClap)
  useEffect(() => {
    if (clapActive) setSub(CLAP_WAITING)
    else setSub((current) => (current === CLAP_WAITING ? "" : current))
  }, [clapActive])

  const toggle = useCallback(async () => {
    // The core is behind the setup card, but the space bar is not — without
    // this, the first thing a keyboard user does on this page opens a
    // microphone underneath a dialog they have not answered yet.
    if (needsSetup) return
    const currentMode = modeRef.current
    if (currentMode === "listening") {
      stopAll()
      return
    }
    if (currentMode === "speaking") {
      manualStopRef.current = true
      setManualStop(true)
      if (resumeTimerRef.current) {
        clearTimeout(resumeTimerRef.current)
        resumeTimerRef.current = null
      }
      cancelSpeech()
      setMode("idle")
      return
    }
    if (currentMode === "thinking") return

    manualStopRef.current = false

    setManualStop(false)
    await startListening()
  }, [needsSetup, startListening, stopAll])

  const checkAndStartListening = useCallback(async () => {
    if (needsSetup || !voiceReady || !micEnabledRef.current || !isMountedRef.current || !isPageVisibleRef.current) return

    const hasSessionGrant = (() => {
      try {
        return sessionStorage.getItem("alacran_mic_granted") === "true"
      } catch {
        return false
      }
    })()

    if (hasSessionGrant && modeRef.current === "idle" && !manualStopRef.current) {
      void startListeningRef.current?.()
      return
    }

    if (typeof navigator !== "undefined" && navigator.permissions?.query) {
      try {
        const permission = await navigator.permissions.query({ name: "microphone" as PermissionName })
        if (!isMountedRef.current || !isPageVisibleRef.current) return
        if (permission.state === "granted" && modeRef.current === "idle" && !manualStopRef.current) {
          void startListeningRef.current?.()
        }
        permission.onchange = () => {
          if (!isMountedRef.current || !isPageVisibleRef.current) return
          if (permission.state === "granted" && modeRef.current === "idle" && !manualStopRef.current) {
            void startListeningRef.current?.()
          }
        }
      } catch {
        /* permissions query for microphone unsupported */
      }
    }
  }, [needsSetup, voiceReady])

  // The switch reads false until hydration corrects it, so the mount-time
  // check below always sees "off" — this is what starts hands-free listening
  // once the real value arrives.
  useEffect(() => {
    if (micEnabled) void checkAndStartListening()
  }, [micEnabled, checkAndStartListening])

  // Leaving page: mute assistant immediately (cancel speech, stop listening)
  // Visiting page: only turn on listening when user visits the page
  useEffect(() => {
    const handleVisibilityOrPage = () => {
      if (typeof document === "undefined") return
      if (document.visibilityState === "hidden") {
        isPageVisibleRef.current = false
        muteAndStop()
      } else if (document.visibilityState === "visible") {
        isPageVisibleRef.current = true
        manualStopRef.current = false
        setManualStop(false)
        if (!needsSetup && voiceReady) {
          void checkAndStartListening()
        }
      }
    }

    const onPageHide = () => {
      isPageVisibleRef.current = false
      muteAndStop()
    }

    document.addEventListener("visibilitychange", handleVisibilityOrPage)
    window.addEventListener("pagehide", onPageHide)
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityOrPage)
      window.removeEventListener("pagehide", onPageHide)
    }
  }, [checkAndStartListening, muteAndStop, needsSetup, voiceReady])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing = target && ["SELECT", "INPUT", "TEXTAREA"].includes(target.tagName)
      if (event.code === "Space" && !typing) {
        event.preventDefault()
        void toggle()
      }
      if (event.code === "Escape") stopAll()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [stopAll, toggle])

  // Mount / unmount: turn on listening when visiting page; fully release audio/mic on unmount
  useEffect(() => {
    isMountedRef.current = true
    isPageVisibleRef.current = typeof document !== "undefined" ? document.visibilityState === "visible" : true

    if (!needsSetup && voiceReady && isPageVisibleRef.current) {
      void checkAndStartListening()
    }

    return () => {
      isMountedRef.current = false
      isPageVisibleRef.current = false
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current)
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
      try {
        recRef.current?.stop()
      } catch {
        /* already stopped */
      }
      cancelSpeech()
      closeMic()
      void acRef.current?.close()
    }
  }, [checkAndStartListening, closeMic, needsSetup, voiceReady])

  /* ------------------------------------------------------------------- view */
  const greeting = persona?.userName ? `Good to see you, ${persona.userName}. What do you need?` : "Good to see you. What do you need?"
  const shownCaption = mode === "idle" && !caption ? greeting : caption
  const shownSub =
    mode === "idle" && !caption && !sub
      ? `Press the core, or hold space, and speak in ${languageName(lang)}.`
      : sub
  const busy = mode === "thinking"

  return (
    <div className="asst-root flex flex-col h-full w-full bg-os-surface text-os-text overflow-hidden relative">
      {/* 1. Header Bar */}
      <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-os-border bg-os-surface/95 backdrop-blur-md shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="size-8 rounded-lg bg-os-accent/10 border border-os-accent/30 flex items-center justify-center shrink-0">
            <Sparkles className="size-4 text-os-accent" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-os-text truncate">
                {persona?.assistantName || "Assistant"}
              </span>
              <span className="flex items-center gap-1 font-mono text-[10px] text-os-dim bg-os-raised px-1.5 py-0.5 rounded border border-os-border">
                <span
                  className={`size-1.5 rounded-full ${
                    mode === "listening"
                      ? "bg-red-500 animate-ping"
                      : mode === "thinking"
                      ? "bg-amber-500 animate-pulse"
                      : mode === "speaking"
                      ? "bg-blue-500 animate-pulse"
                      : "bg-emerald-500"
                  }`}
                />
                <span>{STATUS[mode]}</span>
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-wrap">
          {/* AI Model Executor */}
          <select
            className="h-7 text-[11px] font-mono bg-os-raised border border-os-border rounded-lg px-2 text-os-text focus:outline-none focus:border-os-accent cursor-pointer max-w-[130px] truncate"
            value={executorId}
            onChange={(event) => {
              const next = event.target.value as AiExecutorId
              setExecutorId(next)
              void saveAssistantExecutor(next)
            }}
            aria-label="AI agent to answer questions"
          >
            {listAiExecutors().map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>

          {/* Company Scope */}
          <select
            className="h-7 text-[11px] font-mono bg-os-raised border border-os-border rounded-lg px-2 text-os-text focus:outline-none focus:border-os-accent cursor-pointer max-w-[120px] truncate"
            value={scope}
            onChange={(event) => setScope(event.target.value)}
            aria-label="Which companies to ask about"
          >
            <option value={ALL_COMPANIES}>All companies</option>
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>

          {/* Spoken Language */}
          <select
            className="h-7 text-[11px] font-mono bg-os-raised border border-os-border rounded-lg px-2 text-os-text focus:outline-none focus:border-os-accent cursor-pointer max-w-[95px] truncate"
            value={lang}
            onChange={(event) => {
              setLang(event.target.value)
              if (recRef.current) recRef.current.lang = event.target.value
            }}
            aria-label="Language you will speak"
          >
            {ASSISTANT_LANGUAGES.map((language) => (
              <option key={language.code} value={language.code}>
                {language.label}
              </option>
            ))}
          </select>

          {/* Voice on / off button */}
          <button
            type="button"
            className={`h-7 px-2 rounded-lg border text-[11px] font-mono inline-flex items-center gap-1 transition-colors ${
              voiceOn
                ? "bg-os-accent/10 border-os-accent/30 text-os-accent"
                : "bg-os-raised border-os-border text-os-dim hover:text-os-text"
            }`}
            title="Spoken voice replies"
            aria-pressed={voiceOn}
            onClick={() => {
              setVoiceOn((on) => {
                if (on) cancelSpeech()
                return !on
              })
            }}
          >
            {voiceOn ? <Volume2 className="size-3" /> : <VolumeX className="size-3" />}
            <span className="hidden sm:inline">{voiceOn ? "Voice" : "Muted"}</span>
          </button>

          {/* Clear history */}
          {lines.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setLines([])
                setCaption("")
                setSub("")
              }}
              className="h-7 px-2 rounded-lg border border-os-border bg-os-raised text-os-dim hover:text-os-text text-[11px] font-mono transition-colors"
              title="Clear conversation"
            >
              Clear
            </button>
          )}

          {/* Close drawer button */}
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="h-7 w-7 rounded-lg border border-os-border bg-os-raised text-os-dim hover:text-os-text inline-flex items-center justify-center transition-colors"
              title="Close assistant"
              aria-label="Close assistant"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </header>

      {/* 2. Scrollable Message Stream */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4" ref={logRef}>
        {lines.length === 0 ? (
          /* Empty / Welcome state with interactive visualizer */
          <div className="flex flex-col items-center justify-center min-h-[380px] text-center max-w-md mx-auto py-6 space-y-6">
            <HumanoidAvatar
              mode={mode}
              onToggle={() => void toggle()}
              audioLevelRef={lvlRef}
              frequencyBinsRef={freqRef}
            />

            <div className="space-y-1.5 px-2">
              <h3 className="text-sm font-semibold text-os-text tracking-tight">{shownCaption}</h3>
              <p className="text-xs text-os-muted leading-relaxed max-w-xs mx-auto">{shownSub}</p>
            </div>

            {/* Quick action prompt chips */}
            <div className="w-full space-y-2 pt-1">
              <div className="text-center text-[10px] font-mono uppercase tracking-wider text-os-dim">
                Quick Prompts
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((text) => (
                  <button
                    key={text}
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      push({ role: "you", text, sub: "typed" })
                      void ask(text, undefined)
                    }}
                    className="rounded-lg border border-os-border bg-os-raised/60 hover:bg-os-raised hover:border-os-accent/40 px-3 py-1.5 text-xs text-os-text transition-all text-left"
                  >
                    {text}
                  </button>
                ))}
              </div>
            </div>

            {/* Grounding context info */}
            <div className="inline-flex items-center gap-1.5 rounded-full border border-os-border/70 bg-os-surface px-3 py-1 text-[10px] font-mono text-os-dim">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              <span>Answers come from your company’s own notes and records</span>
            </div>
          </div>
        ) : (
          /* Active conversation state with compact HUD */
          <div className="space-y-4 pb-2">
            <div className="sticky top-0 z-10 -mt-2 pt-2 pb-1 bg-os-surface/95 backdrop-blur-sm">
              <HumanoidAvatar
                compact
                mode={mode}
                onToggle={() => void toggle()}
                audioLevelRef={lvlRef}
                frequencyBinsRef={freqRef}
              />
            </div>

            {lines.map((line, i) => (
              <div
                key={i}
                className={`flex flex-col gap-1 ${
                  line.role === "you" ? "items-end" : "items-start"
                }`}
              >
                <div className="flex items-center gap-1.5 text-[10px] font-mono text-os-dim px-1">
                  <span>{line.role === "you" ? "You" : persona?.assistantName || "Assistant"}</span>
                  {line.sub && <span>· {line.sub}</span>}
                </div>
                <div
                  className={`rounded-2xl px-4 py-2.5 max-w-[88%] text-xs leading-relaxed ${
                    line.role === "you"
                      ? "bg-os-accent text-os-accent-foreground font-medium rounded-br-xs shadow-sm"
                      : "bg-os-raised border border-os-border text-os-text rounded-bl-xs shadow-sm space-y-2"
                  }`}
                >
                  <div className="whitespace-pre-wrap">{line.text}</div>
                  {line.proposal && (
                    <div className="mt-2 pt-2 border-t border-os-border/60">
                      <ProposalCard proposal={line.proposal} companyName={companies.find((c) => c.id === line.proposal?.companyId)?.name} />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 3. Sticky Bottom Composer */}
      <div className="p-3 border-t border-os-border bg-os-surface shrink-0 space-y-2">
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            const text = typed.trim()
            if (!text || busy) return
            setTyped("")
            // Typed means the user chose not to talk: don't reopen the mic
            // after the answer. Pressing the mic clears this.
            manualStopRef.current = true
            setManualStop(true)
            push({ role: "you", text, sub: "typed" })
            void ask(text, needsTranslation(lang) ? languageName(lang) : undefined)
          }}
        >
          <div className="relative flex-1">
            <input
              ref={typedRef}
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              placeholder="Ask anything about this company..."
              aria-label="Ask a question"
              disabled={busy}
              className="w-full rounded-xl border border-os-border bg-os-raised px-3.5 py-2 text-xs text-os-text placeholder:text-os-dim focus:border-os-accent focus:outline-none pr-9 transition-colors"
            />
            <button
              type="button"
              onClick={() => void toggle()}
              className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md transition-colors ${
                mode === "listening"
                  ? "text-red-500 animate-pulse"
                  : "text-os-muted hover:text-os-text"
              }`}
              title={mode === "listening" ? "Stop microphone" : "Voice input"}
            >
              <Mic className="size-3.5" />
            </button>
          </div>
          <button
            type="submit"
            disabled={busy || !typed.trim()}
            className="inline-flex items-center justify-center rounded-xl bg-os-accent text-os-accent-foreground px-3.5 py-2 text-xs font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            aria-label="Send question"
          >
            <ArrowUp className="size-3.5" />
          </button>
        </form>

        <div className="flex items-center justify-between text-[10px] font-mono text-os-dim px-1">
          <div className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            <span>
              {!voiceReady
                ? "Voice needs API key"
                : voiceProviderId === "deepgram"
                ? "Deepgram voice active"
                : hasEngine
                ? "Browser speech ready"
                : "Text mode"}
            </span>
            {mic && (
              <button
                type="button"
                onClick={() => void resetMic()}
                disabled={micBusy}
                className="underline hover:text-os-text ml-1"
              >
                Reset mic
              </button>
            )}
          </div>
          <div>Space to talk · Esc to stop</div>
        </div>

        {micNote && <p className="text-[10px] font-mono text-amber-400 px-1">{micNote}</p>}
      </div>

      {needsSetup && <AssistantSetup initial={null} />}
    </div>
  )
}

/** 2043 → "2.0k"; 640 → "640". */
function formatTokens(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}
