import type { AiExecutorId } from "../ai-executors"
import type { McpServer } from "../mcp-servers-config"

export type SummarizeNetworkAccessInput = {
  aiExecutorId: AiExecutorId
  hasIntegration: boolean
  remoteUrl: string | null
  /** Optional so every pre-v58 caller and test keeps working unchanged. */
  mcpServers?: McpServer[]
}

// Only claim what we actually know. Claude Code is always a real cloud API
// call under the user's own account.
const AI_EXECUTOR_NETWORK_LABEL: Record<AiExecutorId, string> = {
  "claude-code": "Anthropic (Claude Code) — your own account",
  // Kiro CLI is AWS's, signed in with the user's own Builder ID / Google /
  // GitHub account (`kiro-cli whoami` reports which). Same "always a real
  // account-bound cloud call" bucket as Claude Code.
  kiro: "AWS (Kiro) — your own account",
  // Moonshot's own service on a Kimi plan, or whatever third-party provider
  // the user configured in Kimi's own settings — `kimi provider` can point it
  // at ~300 endpoints. The app cannot see which, so it says so rather than
  // naming one, the same call v34 made for Aider's invisible model backend.
  kimi: "Kimi Code — your own account, or the provider you configured in Kimi",
  "google-antigravity": "Google (Antigravity CLI) — your own account",
  // OpenAI's own CLI, signed in with the user's ChatGPT plan or their own API
  // key (`codex login status` reports which — measured: "Logged in using
  // ChatGPT"). Same account-bound cloud call bucket as the rest.
  codex: "OpenAI (Codex CLI) — your own account",
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
