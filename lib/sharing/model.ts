/** What a string between two companies is, with nothing here that touches the
 *  disk — the Companies page imports it, and a browser bundle cannot take
 *  `node:fs`. Reading and writing live in `links.ts`. */

/** What a string lets the receiving company's assistants read. Only these three:
 *  the company's summary, its recent decisions, and its definitions file. Notes,
 *  chat-derived text, records (money, leads) and credentials are never offered —
 *  there is no switch for them, so no string can carry them. */
export type ShareScope = { summary: boolean; decisions: boolean; definitions: boolean }

export const SHARE_SCOPE_KEYS = ["summary", "decisions", "definitions"] as const
export type ShareScopeKey = (typeof SHARE_SCOPE_KEYS)[number]

export const DEFAULT_SHARE_SCOPE: ShareScope = { summary: true, decisions: true, definitions: true }

/** The words the checklist and the confirmation use, so the two say the same thing. */
export const SHARE_SCOPE_LABELS: Record<ShareScopeKey, { label: string; hint: string }> = {
  summary: { label: "Company summary", hint: "What the company is and does." },
  decisions: { label: "Recent decisions", hint: "The latest few decisions, with their reasoning." },
  definitions: { label: "Definitions", hint: "The company's own facts file." },
}

/** One string: `from` shares its knowledge with `to`. One way — a second string
 *  the other way round is how two companies share with each other. */
export type ShareLink = {
  id: string
  from: string
  to: string
  scope: ShareScope
  createdAt: string
}

/** A scope as it will be stored: only the three known switches, each a real
 *  boolean, anything absent off. Null when nothing is on, since a string that
 *  shares nothing is a string that should be cut. */
export function cleanShareScope(raw: unknown): ShareScope | null {
  const source = typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>) : {}
  const scope: ShareScope = {
    summary: source.summary === true,
    decisions: source.decisions === true,
    definitions: source.definitions === true,
  }
  return SHARE_SCOPE_KEYS.some((key) => scope[key]) ? scope : null
}
