"use server"

import { AGENTS } from "./config"
import { checkPollLockStatus } from "./adapters/poll-lock"
import type { PollLockStatus } from "./adapters/poll-lock"

const pipeline_AGENT_ID = "email-pipeline-agent"

export async function getPollStatus(): Promise<PollLockStatus> {
  const agent = AGENTS.find((a) => a.id === pipeline_AGENT_ID)
  if (!agent) {
    return { running: false, lockAgeSeconds: null }
  }
  return checkPollLockStatus(agent.rootPath)
}
