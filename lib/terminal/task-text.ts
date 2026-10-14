export const MAX_TASK = 4000

/**
 * A leading "!" is a shell command line in Claude Code, run with no permission prompt, so a task
 * that starts with one is refused. Shared so the server and the card say the same sentence.
 */
export const BANG_REFUSAL =
  'A task can\'t start with "!": your agent would run it as a command line without asking you. Reword it.'

/**
 * One task is always ONE typed line. A newline would submit early, ESC starts a terminal escape
 * sequence (including the bracketed-paste markers), and C1 controls such as U+009B act as a CSI.
 * All of them, and the Unicode line/paragraph separators, become a single space. Applied in the
 * voice handler AND again on the server, because the client's word is never taken for it.
 */
export function sanitizeTaskText(value: unknown): string {
  if (typeof value !== "string") return ""
  return value
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ")
    .replace(/ {2,}/g, " ")
    .trim()
    .slice(0, MAX_TASK)
}
