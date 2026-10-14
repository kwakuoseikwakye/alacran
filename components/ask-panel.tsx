"use client"

import { Mic, Square, Volume2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { useVoiceAsk } from "@/components/use-voice-ask"

/**
 * The ask box and its answer — mic (when the browser really has one), a typed
 * fallback that is ALWAYS rendered, and the reply.
 *
 * The typed input is not a degraded mode shown only on detection failure.
 * `getSpeechRecognition()` can only prove the constructor exists, not that
 * anything is behind it, and whether it works inside this app's Electron and
 * WebKitGTK shells is unverified — so typing stays a first-class way in.
 */
export function AskPanel({
  voice,
  intro,
  placeholder = "Or type your question",
}: {
  voice: ReturnType<typeof useVoiceAsk>
  intro?: string
  placeholder?: string
}) {
  const { phase, question, setQuestion, answer, canListen, startListening, stopListening, submit } = voice
  const busy = phase === "thinking" || phase === "listening"

  return (
    <div className="flex flex-col gap-4">
      {intro && <p className="text-sm text-muted-foreground">{intro}</p>}

      {canListen && (
        <Button
          type="button"
          variant={phase === "listening" ? "destructive" : "default"}
          onClick={phase === "listening" ? stopListening : startListening}
          disabled={phase === "thinking"}
        >
          {phase === "listening" ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          {phase === "listening" ? "Stop" : "Tap to speak"}
        </Button>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault()
          void submit(question)
        }}
        className="flex gap-2"
      >
        <Input
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          placeholder={canListen ? placeholder : "Voice input isn't supported here — type your question"}
          disabled={busy}
        />
        <Button type="submit" disabled={busy || !question.trim()}>
          Ask
        </Button>
      </form>

      {phase === "thinking" && <p className="text-sm text-muted-foreground">Thinking…</p>}

      {answer && (
        <div className="rounded-md border border-border p-3 text-sm">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Volume2 className="h-3.5 w-3.5" />
            {phase === "error" ? "Couldn't answer" : "Answer"}
          </p>
          <p className="whitespace-pre-wrap">{answer}</p>
        </div>
      )}
    </div>
  )
}
