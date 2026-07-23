"use server"

import { AGENTS } from "./config"
import { checkPollLockStatus } from "./adapters/poll-lock"
import type { PollLockStatus } from "./adapters/poll-lock"

const TAKESHI_AGENT_ID = "plh-takeshi-agent"

export async function getPollStatus(): Promise<PollLockStatus> {
  const agent = AGENTS.find((a) => a.id === TAKESHI_AGENT_ID)
  if (!agent) {
    return { running: false, lockAgeSeconds: null }
  }
  return checkPollLockStatus(agent.rootPath)
}
