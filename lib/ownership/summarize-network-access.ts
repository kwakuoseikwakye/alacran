import type { AiExecutorId } from "../ai-executors"
import type { McpServer } from "../mcp-servers-config"

export type SummarizeNetworkAccessInput = {
  aiExecutorId: AiExecutorId
  hasIntegration: boolean
  remoteUrl: string | null
  /** Optional so every pre-v58 caller and test keeps working unchanged. */
  mcpServers?: McpServer[]
}

// Only claim what we actually know. Claude Code and Codex are always a real
// cloud API call under the user's own account; Aider's backend is the user's
// own config (see lib/ai-executors.ts) and is genuinely invisible to this app,
// so it gets an honest "depends," not a guess.
const AI_EXECUTOR_NETWORK_LABEL: Record<AiExecutorId, string> = {
  "claude-code": "Anthropic (Claude Code) — your own account",
  "openai-codex": "OpenAI (Codex CLI) — your own account",
  aider: "Depends on your own Aider model config (OpenAI, Anthropic, or a local model) — not visible to this app",
  "google-antigravity": "Google (Antigravity CLI) — your own account",
}

export function summarizeNetworkAccess(input: SummarizeNetworkAccessInput): string[] {
  const entries: string[] = [AI_EXECUTOR_NETWORK_LABEL[input.aiExecutorId]]
  if (input.hasIntegration) {
    entries.push("Google, via gog — your own account")
  }
  if (input.remoteUrl) {
    entries.push("GitHub — your own private repository")
  }
  // A wired MCP server is external network access, so this list would be
  // lying by omission without it. Each one is a real remote endpoint the
  // company's interactive sessions can call, signed in as the user.
  for (const server of input.mcpServers ?? []) {
    entries.push(`${server.name} (MCP) — ${server.url}, signed in with your own account`)
  }
  return entries
}
