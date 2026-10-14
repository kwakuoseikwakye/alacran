const DIM = "\x1b[2m"
const RED = "\x1b[31m"
const PLAIN = "\x1b[0m"

/** Terminal line endings: xterm moves down on \n but only back to column 0 on \r. */
const crlf = (text: string) => text.replace(/\r?\n/g, "\r\n")

export type FormattedLine = { text: string; result?: { ok: boolean; summary: string | null } }

type Part = { type?: unknown; text?: unknown; name?: unknown; input?: Record<string, unknown>; is_error?: unknown; content?: unknown }

/**
 * One line of `claude -p --output-format stream-json --verbose` as terminal
 * text for an agent's pane.
 *
 * Deliberately a summary, not a transcript: what the agent says, and one short
 * line per tool call ("Reading notes/x.md"), because that is what a person
 * glancing at eight panes can follow. Tool RESULTS are file contents and
 * search hits — noise at this size — so only a failed one is shown. The final
 * `result` event is reported to the caller, which prints its own summary.
 */
export function formatStreamLine(line: string, root: string | string[]): FormattedLine {
  const trimmed = line.trim()
  if (!trimmed) return { text: "" }
  let event: {
    type?: unknown
    subtype?: unknown
    model?: unknown
    is_error?: unknown
    result?: unknown
    message?: { content?: unknown }
  }
  try {
    event = JSON.parse(trimmed)
  } catch {
    // The CLI's own words (not logged in, a bad flag) arrive as plain text.
    return { text: `${DIM}${crlf(trimmed)}${PLAIN}\r\n` }
  }
  if (!event || typeof event !== "object") return { text: "" }

  // More than one root because the same folder has more than one name: the
  // agent reports resolved paths, and on macOS the data and temp dirs can sit
  // behind a symlink (/tmp is /private/tmp).
  const roots = Array.isArray(root) ? root : [root]
  const relative = (p: unknown) => {
    if (typeof p !== "string") return ""
    const match = roots.find((r) => p.startsWith(`${r}/`))
    return match ? p.slice(match.length + 1) : p
  }
  const parts: Part[] = Array.isArray(event.message?.content) ? (event.message.content as Part[]) : []

  switch (event.type) {
    case "system":
      return event.subtype === "init"
        ? { text: `${DIM}Started${typeof event.model === "string" ? ` · ${event.model}` : ""}${PLAIN}\r\n` }
        : { text: "" }
    case "assistant": {
      let text = ""
      for (const part of parts) {
        if (part.type === "text" && typeof part.text === "string" && part.text.trim()) {
          text += `${crlf(part.text.trim())}\r\n`
        } else if (part.type === "tool_use") {
          text += `${DIM}  ${describeTool(part.name, part.input ?? {}, relative)}${PLAIN}\r\n`
        }
      }
      return { text }
    }
    case "user": {
      let text = ""
      for (const part of parts) {
        if (part.type === "tool_result" && part.is_error === true) {
          text += `${RED}  ✗ ${firstLine(part.content)}${PLAIN}\r\n`
        }
      }
      return { text }
    }
    case "result":
      return {
        text: "",
        result: {
          ok: event.subtype === "success" && event.is_error !== true,
          // The agent's own last words, for the review card.
          summary: typeof event.result === "string" && event.result.trim() ? event.result.trim().slice(0, 2000) : null,
        },
      }
    default:
      return { text: "" }
  }
}

function describeTool(name: unknown, input: Record<string, unknown>, relative: (p: unknown) => string): string {
  switch (name) {
    case "Read":
      return `Reading ${relative(input.file_path)}`
    case "Edit":
    case "MultiEdit":
      return `✎ Editing ${relative(input.file_path)}`
    case "Write":
      return `✎ Writing ${relative(input.file_path)}`
    case "NotebookEdit":
      return `✎ Editing ${relative(input.notebook_path)}`
    case "Grep":
      return `Searching for “${String(input.pattern ?? "")}”`
    case "Glob":
      return `Looking for ${String(input.pattern ?? "")}`
    default:
      return typeof name === "string" ? name : "Working"
  }
}

/** A tool result's content is a string or a list of text blocks. */
function firstLine(content: unknown): string {
  const text = Array.isArray(content)
    ? content.map((c) => (typeof c?.text === "string" ? c.text : "")).join("\n")
    : String(content ?? "")
  return text.trim().split("\n")[0].slice(0, 200)
}
