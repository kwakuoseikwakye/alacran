"use server"

import { readFile } from "node:fs/promises"
import path from "node:path"
import { AGENTS } from "../config"
import { tailLines } from "../log-tail"

const pipeline_AGENT_ID = "email-pipeline-agent"
const MAX_TAIL_LINES = 200

async function readTail(filePath: string): Promise<string> {
  try {
    const content = await readFile(filePath, "utf-8")
    return tailLines(content.replace(/\n$/, ""), MAX_TAIL_LINES)
  } catch {
    return ""
  }
}

export async function getPollLogTail(): Promise<{ stdout: string; stderr: string }> {
  const agent = AGENTS.find((a) => a.id === pipeline_AGENT_ID)
  if (!agent) {
    return { stdout: "", stderr: "" }
  }

  const [stdout, stderr] = await Promise.all([
    readTail(path.join(agent.rootPath, "logs", "poll.out.log")),
    readTail(path.join(agent.rootPath, "logs", "poll.err.log")),
  ])
  return { stdout, stderr }
}
