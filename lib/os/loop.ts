/**
 * How Alacrán works, in four beats. The sidebar is a set of nouns (Home, Ask,
 * Approvals, Records); this is the verb sequence that connects them, said the
 * same way wherever it appears.
 */
export const LOOP_BEATS = [
  { id: "ask", label: "You ask" },
  { id: "draft", label: "Alacrán drafts" },
  { id: "approve", label: "You approve" },
  { id: "saved", label: "Alacrán remembers it" },
] as const

export type LoopBeatId = (typeof LOOP_BEATS)[number]["id"]
