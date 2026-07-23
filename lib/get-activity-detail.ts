"use server"

import { readFile, stat } from "node:fs/promises"
import { resolveWithinAgentRoot } from "./path-guard"

export async function getActivityDetail(detailPath: string): Promise<string> {
  const result = await resolveWithinAgentRoot(detailPath)
  if (!result) {
    throw new Error("Refusing to read a path outside configured agent directories")
  }
  const stats = await stat(result.realPath)
  if (stats.isDirectory()) {
    throw new Error("This activity has no single file to display")
  }
  return readFile(result.realPath, "utf-8")
}
