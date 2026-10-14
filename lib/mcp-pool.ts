import { readFile, writeFile, mkdir } from "node:fs/promises"
import path from "node:path"
import { dataPath } from "./data-dir"
import { MCP_PRESETS } from "./mcp-presets"
import { isSafeServerName, isSafeServerUrl, type McpServer } from "./mcp-servers-config"

/**
 * Every MCP server this machine knows about — the six presets plus anything
 * added by hand. The missing half of the Google model: without it, a name and
 * URL are retyped for every company that wants the same tool.
 *
 * No secret lives here. An entry is a name and an https URL; the OAuth token
 * stays in the executor's own store after the sign-in Open in Terminal runs.
 */
export const MCP_POOL_PATH = dataPath("mcp-pool.json")

const seeded = (): McpServer[] => MCP_PRESETS.map(({ name, url }) => ({ name, url }))

export async function readMcpPool(filePath: string = MCP_POOL_PATH): Promise<McpServer[]> {
  let raw: string
  try {
    raw = await readFile(filePath, "utf-8")
  } catch {
    return seeded()
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return seeded()
    const valid = parsed.filter(
      (s): s is McpServer =>
        typeof s === "object" && s !== null &&
        isSafeServerName(String((s as McpServer).name)) &&
        isSafeServerUrl(String((s as McpServer).url))
    )
    return valid
  } catch {
    return seeded()
  }
}

export async function addToMcpPool(
  server: McpServer,
  filePath: string = MCP_POOL_PATH
): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!isSafeServerName(server.name)) return { ok: false, message: "That server name isn't usable." }
  if (!isSafeServerUrl(server.url)) return { ok: false, message: "An MCP address must be an https URL." }
  const pool = await readMcpPool(filePath)
  const next = [...pool.filter((s) => s.name !== server.name), server]
  await mkdir(path.dirname(filePath), { recursive: true })
  await writeFile(filePath, `${JSON.stringify(next, null, 2)}\n`, "utf-8")
  return { ok: true }
}
