import type { AiExecutorId } from "../ai-executors"

export type NetworkAccessEntry = { label: string }

export type SummarizeNetworkAccessInput = {
  aiExecutorId: AiExecutorId
  hasIntegration: boolean
  remoteUrl: string | null
}

// Only claim what we actually know. Claude Code and Codex are always a real
// cloud API call under the user's own account; Aider's backend is the user's
// own config (see lib/ai-executors.ts) and is genuinely invisible to this app,
// so it gets an honest "depends," not a guess.
const AI_EXECUTOR_NETWORK_LABEL: Record<AiExecutorId, string> = {
  "claude-code": "Anthropic (Claude Code) — your own account",
  "openai-codex": "OpenAI (Codex CLI) — your own account",
  aider: "Depends on your own Aider model config (OpenAI, Anthropic, or a local model) — not visible to this app",
}

export function summarizeNetworkAccess(input: SummarizeNetworkAccessInput): NetworkAccessEntry[] {
  const entries: NetworkAccessEntry[] = [{ label: AI_EXECUTOR_NETWORK_LABEL[input.aiExecutorId] }]
  if (input.hasIntegration) {
    entries.push({ label: "Google, via gog — your own account" })
  }
  if (input.remoteUrl) {
    entries.push({ label: "GitHub — your own private repository" })
  }
  return entries
}
