"use server"

import { readFile } from "node:fs/promises"
import { resolveWithinAgentRoot } from "./path-guard"

export async function getActivityDetail(detailPath: string): Promise<string> {
  const result = await resolveWithinAgentRoot(detailPath)
  if (!result) {
    throw new Error("Refusing to read a path outside configured agent directories")
  }
  return readFile(result.realPath, "utf-8")
}
