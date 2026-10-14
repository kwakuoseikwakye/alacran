/**
 * What a draft waiting for approval is called, in words a business owner uses.
 * One map for Approvals and for Home: they used to keep two that disagreed
 * ("Review your weekly summary" vs "Save your weekly summary"), and a command
 * missing from either fell back to a command id like "define company".
 */
const TITLES: Record<string, string> = {
  "session-note": "Save session summary",
  "delegate-task": "Save task summary",
  digest: "Save your weekly summary",
  decision: "Save this decision",
  retro: "Save this retrospective",
  refresh: "Update your company profile",
  "define-company": "Save your company profile",
  orientation: "Save your getting-started note",
}

export function approvalTitle(commandId: string): string {
  return TITLES[commandId] ?? `Review ${commandId.replaceAll("-", " ")}`
}
