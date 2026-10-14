/**
 * The voice page lets someone speak in any of nine languages and get an
 * English answer back, with the transcript rail showing what was heard in
 * English underneath. That needs two things out of one call — a faithful
 * translation and the answer — so the prompt asks for a small JSON envelope.
 *
 * Only used when the spoken language is not already English: an English
 * speaker gets the plain-text path unchanged, which is one less thing to
 * parse and one less way to fail.
 */
export type VoiceEnvelope = { english: string; reply: string }

export function voiceEnvelopeInstruction(languageName: string): string {
  return `

The user spoke this aloud in ${languageName}. Respond with ONLY a JSON object — no code fence, no commentary before or after:
{"english": "<faithful English translation of what they said; repeat it unchanged if it is already English>", "reply": "<your answer, following every rule above>"}`
}

/**
 * Tolerant on purpose: models wrap JSON in prose or a fence often enough that
 * a strict `JSON.parse` of the whole response would fail on answers that are
 * otherwise perfectly good. Takes the outermost braces, the same slice the
 * design prototype used.
 *
 * Returns null rather than throwing when there is no usable envelope, so the
 * caller can fall back to treating the raw text as the reply — an answer that
 * arrived is worth more than a translation that did not.
 */
export function parseVoiceEnvelope(raw: string): VoiceEnvelope | null {
  const start = raw.indexOf("{")
  const end = raw.lastIndexOf("}")
  if (start === -1 || end <= start) return null
  try {
    const parsed: unknown = JSON.parse(raw.slice(start, end + 1))
    if (typeof parsed !== "object" || parsed === null) return null
    const { english, reply } = parsed as Record<string, unknown>
    const replyText = typeof reply === "string" ? reply.trim() : ""
    if (!replyText) return null
    return { english: typeof english === "string" ? english.trim() : "", reply: replyText }
  } catch {
    return null
  }
}

export type EnvelopeResult =
  | { ok: true; answer: string; english?: string }
  | { ok: false; message: string }

export function asEnvelopeResult(answer: string): EnvelopeResult {
  const envelope = parseVoiceEnvelope(answer)
  if (!envelope) return { ok: true, answer }
  return envelope.english
    ? { ok: true, answer: envelope.reply, english: envelope.english }
    : { ok: true, answer: envelope.reply }
}

