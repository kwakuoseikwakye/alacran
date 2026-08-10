import { writeFile } from "node:fs/promises"
import path from "node:path"
import { getEffectiveAgents } from "./get-effective-agents"
import { commitFile } from "./git-commit-file"
import type { ExecFileFn } from "./git-commit-file"
import {
  MCP_SERVERS_RELATIVE_PATH,
  isSafeServerName,
  isSafeServerUrl,
  readMcpServersRaw,
  unmanagedEntries,
  type McpServer,
} from "./mcp-servers-config"

export type SaveMcpServersResult = { ok: true; message: string } | { ok: false; message: string }

/**
 * Writes the company's own .mcp.json. Mirrors saveGoogleAccountsImpl: the
 * agent is resolved through getEffectiveAgents (containment — the write can
 * only ever land inside a known company's root) and the path is a fixed
 * relative constant, so there is no arbitrary-path input to guard.
 *
 * No secret is written here. An MCP server entry is a name and an https URL;
 * the OAuth token lives in Claude Code's own store once the user signs in.
 */
export async function saveMcpServersImpl(
  agentId: string,
  servers: McpServer[],
  execFn?: ExecFileFn
): Promise<SaveMcpServersResult> {
  const agents = await getEffectiveAgents()
  const agent = agents.find((a) => a.id === agentId)
  if (!agent || agent.kind !== "command-set") return { ok: false, message: "Unknown company" }

  // The UI only ever submits a preset or a validated form value, but this is
  // a public Server Action — refuse at write time so the caller gets a real
  // error instead of readMcpServers silently dropping the entry later.
  const badName = servers.find((s) => !isSafeServerName(s.name))
  if (badName) {
    return { ok: false, message: `"${badName.name}" isn't a valid name — letters, numbers, - and _ only` }
  }
  const badUrl = servers.find((s) => !isSafeServerUrl(s.url))
  if (badUrl) {
    return { ok: false, message: `"${badUrl.url}" isn't an https:// address` }
  }
  const duplicate = servers.find(
    (s, i) => servers.findIndex((other) => other.name.toLowerCase() === s.name.toLowerCase()) !== i
  )
  if (duplicate) {
    return { ok: false, message: `"${duplicate.name}" is already added` }
  }

  const existing = await readMcpServersRaw(agent.rootPath)
  const mcpServers = {
    ...unmanagedEntries(existing),
    ...Object.fromEntries(servers.map((s) => [s.name, { type: "http", url: s.url }])),
  }

  await writeFile(
    path.join(agent.rootPath, MCP_SERVERS_RELATIVE_PATH),
    `${JSON.stringify({ mcpServers }, null, 2)}\n`,
    "utf-8"
  )

  try {
    await commitFile(
      agent.rootPath,
      MCP_SERVERS_RELATIVE_PATH,
      "Update MCP servers via AI-Native control panel",
      execFn
    )
  } catch {
    // Unlike saveGoogleAccountsImpl, a failed commit must not fail the save.
    // commitFile throws when `git add` refuses, and .mcp.json is commonly
    // gitignored in real-world repos — so a company registered from an
    // existing directory (v11's flow) would otherwise turn every save into a
    // 500. The file write is the point; committing it is convenience.
    return { ok: true, message: "Saved (not committed — this repo ignores .mcp.json)" }
  }
  return { ok: true, message: "Saved" }
}
