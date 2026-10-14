import { describe, expect, it } from "vitest"
import { parseVoiceEnvelope, voiceEnvelopeInstruction } from "./voice-envelope"
import { asEnvelopeResult } from "../ask-company-impl"

describe("voiceEnvelopeInstruction", () => {
  it("names the spoken language and demands bare JSON", () => {
    const instruction = voiceEnvelopeInstruction("Japanese")
    expect(instruction).toContain("Japanese")
    expect(instruction).toContain("no code fence")
    expect(instruction).toContain('"english"')
    expect(instruction).toContain('"reply"')
  })
})

describe("parseVoiceEnvelope", () => {
  it("reads a clean envelope", () => {
    const raw = '{"english":"what ran overnight","reply":"Two jobs ran."}'
    expect(parseVoiceEnvelope(raw)).toEqual({ english: "what ran overnight", reply: "Two jobs ran." })
  })

  it("tolerates a code fence and surrounding prose, which models add unprompted", () => {
    const raw = 'Sure!\n```json\n{"english":"hola","reply":"Hi there."}\n```\nHope that helps.'
    expect(parseVoiceEnvelope(raw)).toEqual({ english: "hola", reply: "Hi there." })
  })

  it("returns null for a plain-text answer, so the caller can keep it as the reply", () => {
    expect(parseVoiceEnvelope("Two jobs ran overnight.")).toBeNull()
  })

  it("returns null when the reply is missing or empty — an envelope with no answer is not an answer", () => {
    expect(parseVoiceEnvelope('{"english":"hola"}')).toBeNull()
    expect(parseVoiceEnvelope('{"english":"hola","reply":"   "}')).toBeNull()
  })

  it("returns null on malformed JSON rather than throwing", () => {
    expect(parseVoiceEnvelope('{"english": "x", "reply":}')).toBeNull()
  })
})

describe("asEnvelopeResult", () => {
  it("unwraps the reply and carries the translation", () => {
    expect(asEnvelopeResult('{"english":"what ran overnight","reply":"Two jobs ran."}')).toEqual({
      ok: true,
      answer: "Two jobs ran.",
      english: "what ran overnight",
    })
  })

  it("degrades to the raw text when the model ignored the JSON instruction", () => {
    // An answer that arrived is worth more than a translation that did not.
    expect(asEnvelopeResult("Two jobs ran overnight.")).toEqual({
      ok: true,
      answer: "Two jobs ran overnight.",
    })
  })

  it("omits english entirely when the translation came back empty", () => {
    // Absent must mean "not available", never an empty "heard: " line in the rail.
    expect(asEnvelopeResult('{"english":"","reply":"Two jobs ran."}')).toEqual({
      ok: true,
      answer: "Two jobs ran.",
    })
  })
})
