/**
 * Plain module, not the client component that reads it — v51's rule: a server
 * component importing a value from a "use client" file silently gets a client
 * reference instead of the string. `AgentCard` is a server component and the
 * buttons it renders are client ones, so this constant crosses that boundary.
 */
export const OPEN_TERMINAL_EVENT = "alacran-open-terminal"

/** Which company's terminal to show. The workspace may currently be showing a
 *  different one, or none. */
export type OpenTerminalDetail = { agentId: string }

/** Fired when an in-app terminal session opens or closes, notifying cards to update live badges. */
export const TERMINAL_STATUS_CHANGED_EVENT = "alacran-terminal-status-changed"
export type TerminalStatusChangedDetail = { agentId?: string }

