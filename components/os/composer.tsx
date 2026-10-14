"use client"

import { useRef, useState } from "react"
import type { FormEvent, KeyboardEvent } from "react"
import { ArrowUp } from "lucide-react"
import { ASSISTANT_OPEN_EVENT } from "@/components/os/assistant-dock"

/** Past this the box scrolls instead of growing. */
export const COMPOSER_MAX_H = 168

export function composerHeight(scrollHeight: number): number {
  return Math.min(scrollHeight, COMPOSER_MAX_H)
}

/** Opens the assistant on this company with the question. The dock listens. */
export function sendToAssistant(text: string, companyId: string): boolean {
  const prompt = text.trim()
  if (!prompt) return false
  window.dispatchEvent(new CustomEvent(ASSISTANT_OPEN_EVENT, { detail: { prompt, companyId } }))
  return true
}

/**
 * The ask box on Home and Ask: glass, one line that grows as you type, Enter
 * to send (Shift+Enter for a new line), and a send button that waits for
 * words. The answer arrives in the assistant beside the page.
 */
export function Composer({
  companyId,
  placeholder = "Ask anything",
  initial = "",
}: {
  companyId: string
  placeholder?: string
  initial?: string
}) {
  const [prompt, setPrompt] = useState(initial)
  const field = useRef<HTMLTextAreaElement>(null)

  function grow() {
    const el = field.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${composerHeight(el.scrollHeight)}px`
  }

  function submit(event?: FormEvent) {
    event?.preventDefault()
    if (!sendToAssistant(prompt, companyId)) return
    setPrompt("")
    requestAnimationFrame(grow)
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // isComposing: Enter that confirms an input-method candidate is not a send.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      submit()
    }
  }

  return (
    <form className="composer" onSubmit={submit}>
      <textarea
        ref={field}
        rows={1}
        value={prompt}
        placeholder={placeholder}
        aria-label="Ask Alacrán"
        onChange={(event) => {
          setPrompt(event.target.value)
          grow()
        }}
        onKeyDown={onKeyDown}
      />
      <button type="submit" disabled={!prompt.trim()} aria-label="Ask">
        <ArrowUp aria-hidden />
      </button>
    </form>
  )
}

/** Suggested first questions, sent straight to the assistant. */
export function ComposerSuggestions({ companyId, items }: { companyId: string; items: string[] }) {
  return (
    <div className="composer-suggestions" role="group" aria-label="Suggested questions">
      {items.map((item) => (
        <button key={item} type="button" onClick={() => sendToAssistant(item, companyId)}>
          {item}
        </button>
      ))}
    </div>
  )
}
