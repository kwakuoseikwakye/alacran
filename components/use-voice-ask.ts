"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  cancelSpeech,
  classifySpeechError,
  getSpeechRecognition,
  markSpeechEngineBroken,
  speak,
  speechFailureMessage,
  type SpeechRecognitionLike,
} from "@/lib/speech"
// Type-only on purpose: the impl imports node:child_process, and v61's finding
// is that a VALUE import from such a module into a client component fails
// `next build` while passing both tsc and vitest. A type is erased.
import type { AskCompanyResult } from "@/lib/ask-company-impl"

export type Phase = "idle" | "listening" | "thinking" | "answered" | "error"

/**
 * Ask-a-question state, shared by the assistant page and the per-company Sheet.
 *
 * One phase machine rather than two: the two surfaces differ in layout, not in
 * behaviour, and a listening state that gets out of step with a speaking state
 * is the kind of bug that only shows up in one of the two copies.
 *
 * `ask` is whatever server action this surface asks with — `askAllCompanies`
 * for the page's "All companies", `askCompany` for one.
 */
export function useVoiceAsk(ask: (question: string) => Promise<AskCompanyResult>) {
  const [phase, setPhase] = useState<Phase>("idle")
  const [question, setQuestion] = useState("")
  const [answer, setAnswer] = useState("")
  /**
   * Starts false — matching the server, where there is no `window` and so no
   * speech constructor — and corrects in an effect. Detecting during render
   * mismatches hydration, because the server renders no mic button and the
   * client renders one; the same shape `advanced-only.tsx` documents for
   * localStorage.
   *
   * This was latent in the per-company Sheet, which only mounts its content
   * on open (client-side), so nothing ever server-rendered it. A permanent
   * page hits it immediately — v107's finding, in a different component.
   *
   * The flash is one frame in the direction of LESS: the typed input is
   * always there, and the mic arrives a moment later.
   */
  const [canListen, setCanListen] = useState(false)
  useEffect(() => setCanListen(getSpeechRecognition() !== undefined), [])
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null)

  const submit = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim()
      if (!trimmed) return
      setPhase("thinking")
      setAnswer("")
      const result = await ask(trimmed)
      if (result.ok) {
        setAnswer(result.answer)
        setPhase("answered")
        speak(result.answer)
      } else {
        setAnswer(result.message)
        setPhase("error")
      }
    },
    [ask]
  )

  const startListening = useCallback(() => {
    const Recognition = getSpeechRecognition()
    if (!Recognition) return
    const recognition = new Recognition()
    recognition.continuous = false
    recognition.interimResults = true
    recognition.lang = "en-US"
    recognition.onresult = (event) => {
      setQuestion(
        Array.from(event.results)
          .map((result) => result[0]?.transcript ?? "")
          .join(" ")
      )
    }
    // Present but broken (see getSpeechRecognition) lands here, and this is
    // the only place it can be learned. Until this classified the error the
    // panel showed a bare "Couldn't answer" with no text under it and went on
    // offering a microphone that could never work.
    recognition.onerror = (event?: { error?: string }) => {
      const failure = classifySpeechError(event?.error)
      if (failure === "silence") {
        setPhase((current) => (current === "listening" ? "idle" : current))
        return
      }
      if (failure === "no-engine") {
        markSpeechEngineBroken()
        setCanListen(false)
      }
      const { caption, next } = speechFailureMessage(failure)
      setAnswer(next ? `${caption} ${next}` : caption)
      setPhase("error")
    }
    recognition.onend = () => setPhase((current) => (current === "listening" ? "idle" : current))
    recognitionRef.current = recognition
    setQuestion("")
    setAnswer("")
    setPhase("listening")
    recognition.start()
  }, [])

  const stopListening = useCallback(() => recognitionRef.current?.stop(), [])

  const reset = useCallback(() => {
    recognitionRef.current?.stop()
    cancelSpeech()
    setPhase("idle")
    setQuestion("")
    setAnswer("")
  }, [])

  return { phase, question, setQuestion, answer, canListen, startListening, stopListening, submit, reset }
}
