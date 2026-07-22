"use server"

import { readFile, realpath } from "node:fs/promises"
import path from "node:path"
import { AGENTS } from "./config"

async function tryRealpath(p: string): Promise<string | null> {
  try {
    return await realpath(p)
  } catch {
    return null
  }
}

export async function getActivityDetail(detailPath: string): Promise<string> {
  const resolved = await tryRealpath(path.resolve(detailPath))
  if (resolved === null) {
    throw new Error("Refusing to read a path outside configured agent directories")
  }

  const roots = await Promise.all(AGENTS.map((agent) => tryRealpath(path.resolve(agent.rootPath))))
  const isWithinAnAgentRoot = roots.some(
    (root) => root !== null && (resolved === root || resolved.startsWith(root + path.sep))
  )
  if (!isWithinAnAgentRoot) {
    throw new Error("Refusing to read a path outside configured agent directories")
  }
  return readFile(resolved, "utf-8")
}
