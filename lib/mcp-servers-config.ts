import { readFile } from "node:fs/promises"
import path from "node:path"

/**
 * Claude Code's own project-scope MCP config, at the company's repo root.
 * Verified live before this was written: a hand-written .mcp.json is picked
 * up and reported by `claude mcp get <name>` as "Scope: Project config
 * (shared via .mcp.json)", status "⏸ Pending approval (run `claude` to
 * approve)". That approval step is why this slice ships no auth code — v38's
 * already-shipped "Open in Terminal" button IS the approval step.
 *
 * This is a Claude-Code-specific adapter artifact, the same tier as
 * `.claude/*` rather than the portable `definitions/` core: `codex mcp add`
 * has no scope flag (machine-global `~/.codex/config.toml` only) and neither
 * Aider nor Antigravity CLI has MCP at all.
 */
export const MCP_SERVERS_RELATIVE_PATH = ".mcp.json"

export type McpServer = { name: string; url: string }

export type ReadFileFn = (filePath: string) => Promise<string>

const defaultReadFile: ReadFileFn = (filePath) => readFile(filePath, "utf-8")

/**
 * A server name is a JSON key, the thing the user types after `/mcp`, and
 * would become an argv value if a login button is ever added. Keep it boring
 * at the one chokepoint rather than escaping it at each use site — same
 * reasoning as isSafeAccountEmail in google-accounts-config.ts.
 */
export function isSafeServerName(value: string): boolean {
  return /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(value)
}

/**
 * This value decides where a company's data goes, so https only. There is
 * deliberately no localhost exception: a local server is the stdio case,
 * which this slice doesn't ship (`claude mcp add` covers it for power users).
 */
export function isSafeServerUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:"
  } catch {
    return false
  }
}

function httpUrlOf(value: unknown): string | null {
  const url = (value as { url?: unknown } | null)?.url
  return typeof url === "string" && isSafeServerUrl(url) ? url : null
}

/**
 * Every entry in the file, unfiltered. The write path needs this so that a
 * server the user added by hand and this UI can't represent (a stdio server,
 * say) survives a save from the dashboard instead of being silently deleted.
 */
export async function readMcpServersRaw(
  agentRootPath: string,
  readFileFn: ReadFileFn = defaultReadFile
): Promise<Record<string, unknown>> {
  let raw: string
  try {
    raw = await readFileFn(path.join(agentRootPath, MCP_SERVERS_RELATIVE_PATH))
  } catch {
    return {}
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }
  const servers = (parsed as { mcpServers?: unknown } | null)?.mcpServers
  return servers && typeof servers === "object" && !Array.isArray(servers)
    ? (servers as Record<string, unknown>)
    : {}
}

/**
 * The HTTP servers this UI can display and manage. Missing file,
 * unparseable JSON, wrong shape, an unsafe name or a non-https URL all
 * resolve to nothing rather than an error — the same fail-soft contract as
 * readGoogleAccounts, so a company that has never touched this feature
 * behaves exactly as it did before this file existed.
 */
export async function readMcpServers(
  agentRootPath: string,
  readFileFn: ReadFileFn = defaultReadFile
): Promise<McpServer[]> {
  const raw = await readMcpServersRaw(agentRootPath, readFileFn)
  const servers: McpServer[] = []
  for (const [name, value] of Object.entries(raw)) {
    const url = httpUrlOf(value)
    if (isSafeServerName(name) && url) servers.push({ name, url })
  }
  return servers
}

/**
 * The entries readMcpServers would have dropped — i.e. the ones the
 * dashboard doesn't manage and must preserve when it rewrites the file.
 */
export function unmanagedEntries(raw: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(raw).filter(([name, value]) => !(isSafeServerName(name) && httpUrlOf(value)))
  )
}
