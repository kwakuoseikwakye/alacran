import { realpath } from "node:fs/promises"
import path from "node:path"
import { AGENTS } from "./config"

export type PathGuardResult = { realPath: string; agentRootPath: string } | null

async function tryRealpath(p: string): Promise<string | null> {
  try {
    return await realpath(p)
  } catch {
    return null
  }
}

export async function resolveWithinAgentRoot(requestedPath: string): Promise<PathGuardResult> {
  const resolved = await tryRealpath(path.resolve(requestedPath))
  if (resolved === null) {
    return null
  }

  for (const agent of AGENTS) {
    const root = await tryRealpath(path.resolve(agent.rootPath))
    if (root === null) continue
    if (resolved === root || resolved.startsWith(root + path.sep)) {
      return { realPath: resolved, agentRootPath: root }
    }
  }
  return null
}
