import { writeFile, mkdir } from "node:fs/promises"
import path from "node:path"
import { getEffectiveAgents } from "./get-effective-agents"
import { commitFile } from "./git-commit-file"
import type { ExecFileFn } from "./git-commit-file"
import { AI_EXECUTORS } from "./ai-executors"
import {
  MCP_SERVERS_RELATIVE_PATH,
  KIRO_MCP_SERVERS_RELATIVE_PATH,
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
 * the OAuth token lives in the executor's own store once the user signs in.
 *
 * Written for every registered executor's config path, unconditionally rather
 * than dispatching on the company's assigned executor — same reasoning as
 * genericCommandSetSkillAdapter: the alternative is an async registry read on
 * a write path, to save one small file in a company that may switch executors
 * tomorrow anyway. The formats are identical (see
 * KIRO_MCP_SERVERS_RELATIVE_PATH), so this is one extra path, not one extra
 * serializer.
 *
 * ponytail: writes both paths always. Gate on resolveAiExecutorForAgent only
 * if the unused file ever actually bothers someone.
 *
 * Only Claude's copy is COMMITTED, deliberately. Committing is already
 * documented below as convenience rather than the point, and Kiro treats
 * config that travels inside a repo as an injection surface — its own
 * workspace permission rules live outside the repo for exactly that reason.
 * A cloned company should not arrive carrying MCP servers.
 */
/**
 * Every registered executor's project-scoped MCP config path, deduplicated.
 *
 * `null` is a real answer — an executor measured to have no project-scoped MCP
 * config — and it contributes no path rather than a guessed one.
 */
export function mcpConfigPaths(): string[] {
  return [...new Set(Object.values(AI_EXECUTORS).map((e) => e.mcpConfigPath).filter((p): p is string => p !== null))]
}

/** Whether ANY registered executor can read a project-scoped MCP config. If
 *  none can, offering to enable one is offering a file nobody reads. */
export function anyExecutorSupportsMcp(): boolean {
  return mcpConfigPaths().length > 0
}

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

  // If nothing on this machine reads a project-scoped MCP config, saying
  // "Added" is the same lie the guessed endpoint told one layer down: a file
  // written and a green dot for something no agent will ever load.
  if (!anyExecutorSupportsMcp()) {
    return {
      ok: false,
      message: "None of the AI agents set up here read MCP servers from a company folder, so this wouldn't do anything yet.",
    }
  }

  // Read each file before rewriting it, per file: a server the user added by
  // hand and this UI cannot represent (a stdio one) must survive a save, and
  // Kiro's copy can hold a different set of those than Claude's.
  // Derived from the registry, NOT a hardcoded pair. The list used to be
  // literally [claude, kiro] under a comment claiming "every registered
  // executor's config path" — accurate when two were registered and silently
  // wrong the day Kimi and Antigravity joined them. Reading it off
  // AI_EXECUTORS means adding a fifth executor cannot skip this quietly: the
  // field is required, so it fails `tsc` until someone answers for it.
  for (const relativePath of mcpConfigPaths()) {
    const existing = await readMcpServersRaw(agent.rootPath, undefined, relativePath)
    const mcpServers = {
      ...unmanagedEntries(existing),
      ...Object.fromEntries(servers.map((s) => [s.name, { type: "http", url: s.url }])),
    }
    const absolute = path.join(agent.rootPath, relativePath)
    // .kiro/settings/ does not exist in a company that has never used Kiro.
    await mkdir(path.dirname(absolute), { recursive: true })
    await writeFile(absolute, `${JSON.stringify({ mcpServers }, null, 2)}\n`, "utf-8")
  }

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
