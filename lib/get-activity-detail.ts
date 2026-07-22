"use server"

import { readFile } from "node:fs/promises"
import path from "node:path"
import { AGENTS } from "./config"

export async function getActivityDetail(detailPath: string): Promise<string> {
  const resolved = path.resolve(detailPath)
  const isWithinAnAgentRoot = AGENTS.some((agent) => {
    const root = path.resolve(agent.rootPath)
    return resolved === root || resolved.startsWith(root + path.sep)
  })
  if (!isWithinAnAgentRoot) {
    throw new Error("Refusing to read a path outside configured agent directories")
  }
  return readFile(resolved, "utf-8")
}
