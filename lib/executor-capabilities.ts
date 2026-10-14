import type { AiExecutor } from "./ai-executors"

/**
 * What a function in the app needs from the company's AI, and the one-line
 * note shown ON that function when the chosen AI can't do it.
 *
 * Every AI is selectable for everything. Where one genuinely cannot do a job
 * (measured against the installed CLIs, 2026-09-28: Kimi 0.39.0, Codex
 * 0.158.0, Antigravity 1.2.11), the app says so where the job is, before the
 * click — not after it, and not in a paragraph beside the picker.
 *
 * Derived from the executor's own fields, so an AI that gains a capability
 * loses its note the moment its registry entry says so.
 */
export type Need =
  /** Jobs that read text written by outsiders (messages, leads, refresh). The
   *  run is refused unless edits can be held to the job's own folder. */
  | "outside-text"
  /** Revising one draft: edits must be held to that one document. */
  | "revise"
  /** Opening an assistant with a first message (terminal tab, Get Started). */
  | "opening-message"
  /** Reopening a finished conversation to write it up automatically. */
  | "resume"
  /** A sign-in button this app can run. */
  | "sign-in"
  /** Reading the company's connected tools (MCP servers) from its folder. */
  | "mcp-servers"

export function cannotNote(executor: AiExecutor, need: Need): string | null {
  const name = executor.label
  switch (need) {
    case "outside-text":
      return executor.enforcesToolScope
        ? null
        : `${name} can't be limited to this job's folder, so it can't run this. Claude Code or Kiro can.`
    case "revise":
      return executor.enforcesToolScope ? null : `${name} can't be limited to one draft, so it can't revise. Claude Code or Kiro can.`
    case "opening-message":
      return executor.buildInteractiveIntroArgs ? null : `${name} opens blank — type your first message yourself.`
    case "resume":
      return executor.resume
        ? null
        : `${name} can't reopen past conversations, so they aren't written up automatically. Use "Save what we learned" in the terminal.`
    case "sign-in":
      return executor.buildSignInArgs ? null : `Sign in to ${name} from its own terminal.`
    case "mcp-servers":
      return executor.mcpConfigPath ? null : `${name} doesn't read these tools from the company folder yet.`
  }
}
