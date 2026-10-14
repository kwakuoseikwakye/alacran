import { END_MARKER, START_PREFIX, sha256, toLf } from "./markers"

export type RenderedGuide = { block: string; fingerprint: string; bodyHash: string }

export type ParsedBlock =
  | { kind: "none" }
  | { kind: "error"; error: "duplicate" | "nested" | "unclosed" }
  | { kind: "ok"; start: number; end: number; fingerprint: string | null; bodyHash: string | null; body: string; untouched: boolean }

function indexesOf(text: string, needle: string): number[] {
  const out: number[] = []
  for (let i = text.indexOf(needle); i >= 0; i = text.indexOf(needle, i + needle.length)) out.push(i)
  return out
}

const unclosed: ParsedBlock = { kind: "error", error: "unclosed" }

export function parseBlock(text: string): ParsedBlock {
  const starts = indexesOf(text, START_PREFIX)
  const ends = indexesOf(text, END_MARKER)
  if (!starts.length && !ends.length) return { kind: "none" }
  if (starts.length > 1 || ends.length > 1) {
    return { kind: "error", error: starts.length > 1 && ends.length >= 1 && starts[1] < ends[0] ? "nested" : "duplicate" }
  }
  if (starts.length !== 1 || ends.length !== 1 || ends[0] < starts[0]) return unclosed
  const close = text.indexOf("-->", starts[0])
  if (close < 0 || close >= ends[0]) return unclosed
  const startLine = text.slice(starts[0], close + 3)
  if (startLine.includes("\n")) return unclosed
  let bodyStart = close + 3
  if (text.startsWith("\r\n", bodyStart)) bodyStart += 2
  else if (text[bodyStart] === "\n") bodyStart += 1
  const body = text.slice(bodyStart, ends[0])
  const fingerprint = /fingerprint=([0-9a-f]{64})/.exec(startLine)?.[1] ?? null
  const bodyHash = /body=([0-9a-f]{64})/.exec(startLine)?.[1] ?? null
  return {
    kind: "ok",
    start: starts[0],
    end: ends[0] + END_MARKER.length,
    fingerprint,
    bodyHash,
    body,
    untouched: bodyHash !== null && sha256(toLf(body)) === bodyHash,
  }
}

function dominantEol(text: string): "\n" | "\r\n" {
  const crlf = (text.match(/\r\n/g) ?? []).length
  const lf = (text.match(/\n/g) ?? []).length - crlf
  return crlf > lf ? "\r\n" : "\n"
}

export function applyGuide(
  text: string,
  rendered: RenderedGuide,
  mode: "append" | "replace"
): { ok: true; text: string } | { ok: false; error: "missing" | "exists" | "duplicate" | "nested" | "unclosed" | "edited" } {
  const parsed = parseBlock(text)
  if (parsed.kind === "error") return { ok: false, error: parsed.error }
  const eol = dominantEol(text)
  const block = eol === "\n" ? rendered.block : rendered.block.replace(/\n/g, eol)
  if (parsed.kind === "none") {
    if (mode === "replace") return { ok: false, error: "missing" }
    if (text === "") return { ok: true, text: block + eol }
    const separator = text.endsWith(eol) ? eol : eol + eol
    return { ok: true, text: text + separator + block + eol }
  }
  if (mode === "append") return { ok: false, error: "exists" }
  if (mode === "replace" && !parsed.untouched) return { ok: false, error: "edited" }
  return { ok: true, text: text.slice(0, parsed.start) + block + text.slice(parsed.end) }
}
