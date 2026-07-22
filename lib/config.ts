import path from "node:path"
import os from "node:os"
import type { Agent, Adapter } from "./adapters/types"
import { plhTakeshiAgentAdapter } from "./adapters/plh-takeshi-agent"
import { aiCompanyStarterMainAdapter } from "./adapters/ai-company-starter-main"
import { plhOpsAdapter } from "./adapters/plh-ops"

const AI_NATIVE_ROOT = path.join(os.homedir(), "AI-Native")

export const AGENTS: Agent[] = [
  {
    id: "plh-takeshi-agent",
    name: "Takeshi Email Agent",
    rootPath: path.join(AI_NATIVE_ROOT, "plh-takeshi-agent"),
    kind: "pipeline",
  },
  {
    id: "ai-company-starter-main",
    name: "AI Company Starter",
    rootPath: path.join(AI_NATIVE_ROOT, "ai-company-starter-main"),
    kind: "command-set",
  },
  {
    id: "plh-ops",
    name: "PLH Ops",
    rootPath: path.join(AI_NATIVE_ROOT, "plh-ops"),
    kind: "report-log",
  },
]

export const ADAPTERS: Record<string, Adapter> = {
  "plh-takeshi-agent": plhTakeshiAgentAdapter,
  "ai-company-starter-main": aiCompanyStarterMainAdapter,
  "plh-ops": plhOpsAdapter,
}

export const TAKESHI_AGENT_LAUNCHD_LABEL = "com.plh.takeshi-agent"
