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
 * Aider nor Antigravity CLI had MCP at all. None of the three is registered
 * any more (v99); the gate stays because it is about the capability.
 */
export const MCP_SERVERS_RELATIVE_PATH = ".mcp.json"

/**
 * Kiro's workspace-scope MCP config.
 *
 * Same `mcpServers` top-level key and the same `{ type, url }` entry shape as
 * Claude's `.mcp.json`, so this is a path constant rather than a second
 * serializer. Both verified against the installed kiro-cli 2.19.1 rather than
 * its docs (which describe a 3.0 that stable does not ship): the binary's own
 * serde field names for an HTTP server are
 * `type`/`url`/`headers`/`oauthScopes`/`disabled`/`disabledTools`/`timeout`,
 * its path table carries `.kiro/settings/mcp.json`, and its `/mcp` screen
 * tells the user to "open ~/.kiro/settings/mcp.json" for the global one.
 *
 * Unlike `codex mcp add`, which has no scope flag at all and writes only
 * machine-global `~/.codex/config.toml` (v99's finding, the fourth instance of
 * that recurring pattern), `kiro-cli mcp add --scope workspace` is a real
 * per-project scope — so a company can carry its own servers.
 */
export const KIRO_MCP_SERVERS_RELATIVE_PATH = path.join(".kiro", "settings", "mcp.json")

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
  readFileFn: ReadFileFn = defaultReadFile,
  /** Trailing-optional so every pre-existing caller and test is unchanged.
   *  Pass KIRO_MCP_SERVERS_RELATIVE_PATH to read that executor's copy. */
  relativePath: string = MCP_SERVERS_RELATIVE_PATH
): Promise<Record<string, unknown>> {
  let raw: string
  try {
    raw = await readFileFn(path.join(agentRootPath, relativePath))
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
