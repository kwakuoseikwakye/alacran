import path from "node:path"
import os from "node:os"
import type { Agent, Adapter } from "./adapters/types"
import { emailPipelineAdapter } from "./adapters/email-pipeline-agent"
import { aiCompanyStarterMainAdapter } from "./adapters/ai-company-starter-main"
import { plhOpsAdapter } from "./adapters/plh-ops"
import type { SkillAdapter } from "./skills/types"
import { aiCompanyStarterMainSkillsAdapter } from "./skills/ai-company-starter-main"
import { emailPipelineSkillsAdapter } from "./skills/email-pipeline-agent"
import { plhOpsSkillsAdapter } from "./skills/plh-ops"

const AI_NATIVE_ROOT = path.join(os.homedir(), "AI-Native")

export const AGENTS: Agent[] = [
  {
    id: "email-pipeline-agent",
    name: "Email Pipeline Agent",
    rootPath: path.join(AI_NATIVE_ROOT, "email-pipeline-agent"),
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
  "email-pipeline-agent": emailPipelineAdapter,
  "ai-company-starter-main": aiCompanyStarterMainAdapter,
  "plh-ops": plhOpsAdapter,
}

export const SKILL_ADAPTERS: Record<string, SkillAdapter> = {
  "email-pipeline-agent": emailPipelineSkillsAdapter,
  "ai-company-starter-main": aiCompanyStarterMainSkillsAdapter,
  "plh-ops": plhOpsSkillsAdapter,
}

export const PIPELINE_LAUNCHD_LABEL = "com.example.email-pipeline"
