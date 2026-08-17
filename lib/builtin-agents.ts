import path from "node:path"
import os from "node:os"
import { existsSync } from "node:fs"
import type { Agent, Adapter } from "./adapters/types"
import { aiCompanyStarterMainAdapter } from "./adapters/ai-company-starter-main"
import { plhOpsAdapter } from "./adapters/plh-ops"
import type { SkillAdapter } from "./skills/types"
import { genericCommandSetSkillAdapter } from "./skills/generic-command-set"
import { scanSkillsDir } from "./skills/scan-helpers"

const AI_NATIVE_ROOT = path.join(os.homedir(), "AI-Native")

type BuiltinDescriptor = {
  agent: Agent
  adapter: Adapter
  skillAdapter: SkillAdapter
}

// Built-in example agents. Each loads only if its directory exists on disk, so
// a shipped/product install (no ~/AI-Native/*) starts empty while a developer
// machine keeps full daily use with zero setup.
const BUILTIN_DESCRIPTORS: BuiltinDescriptor[] = [
  {
    agent: {
      id: "ai-company-starter-main",
      name: "AI Company Starter",
      rootPath: path.join(AI_NATIVE_ROOT, "ai-company-starter-main"),
      kind: "command-set",
    },
    adapter: aiCompanyStarterMainAdapter,
    skillAdapter: genericCommandSetSkillAdapter,
  },
  {
    agent: {
      id: "plh-ops",
      name: "PLH Ops",
      rootPath: path.join(AI_NATIVE_ROOT, "plh-ops"),
      kind: "report-log",
    },
    adapter: plhOpsAdapter,
    // plh-ops's skills live under workflow/, not .claude/skills, so the
    // generic command-set skill adapter doesn't apply.
    skillAdapter: (agent) => scanSkillsDir(agent.id, path.join(agent.rootPath, "workflow")),
  },
]

export type Builtins = {
  agents: Agent[]
  adapters: Record<string, Adapter>
  skillAdapters: Record<string, SkillAdapter>
}

export function buildBuiltins(exists: (absPath: string) => boolean = existsSync): Builtins {
  const present = BUILTIN_DESCRIPTORS.filter((d) => exists(d.agent.rootPath))
  return {
    agents: present.map((d) => d.agent),
    adapters: Object.fromEntries(present.map((d) => [d.agent.id, d.adapter])),
    skillAdapters: Object.fromEntries(present.map((d) => [d.agent.id, d.skillAdapter])),
  }
}
