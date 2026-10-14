import { appendFile, mkdir, readFile } from "node:fs/promises"
import path from "node:path"

export type Outcome = "approved" | "discarded" | "revised"
export type OutcomeKind = "new-file-in-dir" | "known-file"
export type OutcomeEntry = { at: string; command: string; outcome: Outcome; kind: OutcomeKind; files: number; feedback?: string }

export const OUTCOMES_FILE = "outcomes.jsonl"
export const FEEDBACK_MAX = 4000
export const WITHHELD = "[feedback withheld: looked like a credential]"

const OUTCOMES: Outcome[] = ["approved", "discarded", "revised"]
const KINDS: OutcomeKind[] = ["new-file-in-dir", "known-file"]

const SECRET_PATTERNS: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{16,}/, // API keys
  /\bAKIA[0-9A-Z]{16}\b/, // AWS access key id
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/, // GitHub tokens
  /\bgithub_pat_[A-Za-z0-9_]{20,}/,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/, // Slack tokens
  /\bAIza[0-9A-Za-z_-]{30,}/, // Google API key
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, // JWT
  /\bBearer\s+[A-Za-z0-9._~+/-]{20,}/,
  /\b(?:password|passwd|pwd|secret)\s*[:=]\s*\S{6,}/i,
  /\b[sr]k_(?:live|test)_[A-Za-z0-9]{10,}/, // Stripe keys
  /\b(?:api[_-]?key|access[_-]?token|auth[_-]?token|token)\s*[:=]\s*\S{8,}/i,
  /\bya29\.[A-Za-z0-9_-]{20,}/, // Google OAuth access token
  /\bmy password is\s+\S{6,}/i,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
]

function luhn(digits: string): boolean {
  let sum = 0
  let double = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48
    if (double) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
    double = !double
  }
  return sum % 10 === 0
}

function hasCardNumber(text: string): boolean {
  for (const m of text.matchAll(/\b(?:\d[ -]?){13,19}\b/g)) {
    const digits = m[0].replace(/\D/g, "")
    if (digits.length >= 13 && digits.length <= 19 && luhn(digits)) return true
  }
  return false
}

export function looksLikeCredential(text: string): boolean {
  return SECRET_PATTERNS.some((p) => p.test(text)) || hasCardNumber(text)
}

export function sanitizeFeedback(text: string): string {
  const trimmed = text.trim().slice(0, FEEDBACK_MAX)
  return looksLikeCredential(trimmed) ? WITHHELD : trimmed
}

/**
 * Appends one line to the company's outcome log. Best-effort by design: an approval, a discard or a
 * revision that already happened must never fail because a log line could not be written.
 */
export async function recordOutcome(
  dataDir: string,
  e: { command: string; outcome: Outcome; kind: OutcomeKind; files: number; feedback?: string; at?: string }
): Promise<void> {
  try {
    const entry: OutcomeEntry = {
      at: e.at ?? new Date().toISOString(),
      command: e.command,
      outcome: e.outcome,
      kind: e.kind,
      files: e.files,
      ...(e.outcome === "revised" && typeof e.feedback === "string" && e.feedback.trim() ? { feedback: sanitizeFeedback(e.feedback) } : {}),
    }
    await mkdir(dataDir, { recursive: true })
    await appendFile(path.join(dataDir, OUTCOMES_FILE), JSON.stringify(entry) + "\n", { mode: 0o600 })
  } catch (err) {
    console.warn(`outcome log write failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}

function parseEntry(line: string): OutcomeEntry | null {
  try {
    const o = JSON.parse(line) as Partial<OutcomeEntry>
    if (
      typeof o.at !== "string" || typeof o.command !== "string" || !o.command ||
      !OUTCOMES.includes(o.outcome as Outcome) || !KINDS.includes(o.kind as OutcomeKind) ||
      typeof o.files !== "number" || !Number.isFinite(o.files)
    ) return null
    return { at: o.at, command: o.command, outcome: o.outcome as Outcome, kind: o.kind as OutcomeKind, files: o.files, ...(typeof o.feedback === "string" ? { feedback: o.feedback } : {}) }
  } catch {
    return null
  }
}

/**
 * Reads complete lines from `sinceOffset` (bytes). The returned offset stops after the last complete
 * line, so a line still being written is read next time. A missing file is empty; a file shorter than
 * the offset (truncated or replaced) is read from the start.
 */
export async function readOutcomes(dataDir: string, sinceOffset = 0): Promise<{ entries: OutcomeEntry[]; offset: number }> {
  let buf: Buffer
  try {
    buf = await readFile(path.join(dataDir, OUTCOMES_FILE))
  } catch {
    return { entries: [], offset: 0 }
  }
  const start = sinceOffset > buf.length || sinceOffset < 0 ? 0 : sinceOffset
  const tail = buf.subarray(start)
  const lastNewline = tail.lastIndexOf(0x0a)
  if (lastNewline === -1) return { entries: [], offset: start }
  const complete = tail.subarray(0, lastNewline + 1)
  const entries = complete.toString("utf-8").split("\n").filter(Boolean).map(parseEntry).filter((e): e is OutcomeEntry => e !== null)
  return { entries, offset: start + complete.length }
}
