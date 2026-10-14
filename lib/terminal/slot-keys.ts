export type SlotKeyAction = { type: "focus"; index: number } | { type: "toggle" } | { type: "grid" } | null

type KeyLike = { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; defaultPrevented?: boolean }

/** Where the key landed. `hidden`: the terminal page isn't the one on screen
 *  (it stays mounted on every company page). `inWorkspace`: aimed at the grid
 *  itself, not a dialog or sheet over it. `inField`: a text field outside any
 *  terminal, where ⌘↵ and Esc are the field's. */
type KeyContext = { isMac: boolean; inTerminal: boolean; hidden: boolean; inWorkspace: boolean; inField: boolean }

/**
 * The grid's shortcuts (spec §5): ⌘1–⌘8 focus a slot, ⌘↵ toggles grid and
 * focus, Esc goes back to the grid. ⌘ on a Mac and Ctrl elsewhere — on a Mac,
 * Ctrl+digit belongs to whatever runs in the terminal. Esc only counts OUTSIDE
 * a terminal: inside one it is the program's (Claude Code uses it to stop).
 */
export function slotKeyAction(event: KeyLike, context: KeyContext): SlotKeyAction {
  // Already someone's — Esc closing a dialog, say — or nothing here to act on.
  if (context.hidden || event.defaultPrevented) return null
  const mod = context.isMac ? event.metaKey : event.ctrlKey
  if (mod && !event.altKey && !event.shiftKey && /^[1-8]$/.test(event.key)) {
    return { type: "focus", index: Number(event.key) - 1 }
  }
  if (!context.inWorkspace || context.inField) return null
  if (mod && !event.altKey && event.key === "Enter") return { type: "toggle" }
  if (!mod && !event.altKey && event.key === "Escape" && !context.inTerminal) return { type: "grid" }
  return null
}
