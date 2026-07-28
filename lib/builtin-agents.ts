import path from "node:path"
import os from "node:os"
import { existsSync } from "node:fs"
import type { Agent, Adapter } from "./adapters/types"
import { plhTakeshiAgentAdapter } from "./adapters/plh-takeshi-agent"
import { aiCompanyStarterMainAdapter } from "./adapters/ai-company-starter-main"
import { plhOpsAdapter } from "./adapters/plh-ops"
import type { SkillAdapter } from "./skills/types"
import { aiCompanyStarterMainSkillsAdapter } from "./skills/ai-company-starter-main"
import { plhTakeshiAgentSkillsAdapter } from "./skills/plh-takeshi-agent"
import { plhOpsSkillsAdapter } from "./skills/plh-ops"

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
      id: "plh-takeshi-agent",
      name: "Takeshi Email Agent",
      rootPath: path.join(AI_NATIVE_ROOT, "plh-takeshi-agent"),
      kind: "pipeline",
    },
    adapter: plhTakeshiAgentAdapter,
    skillAdapter: plhTakeshiAgentSkillsAdapter,
  },
  {
    agent: {
      id: "ai-company-starter-main",
      name: "AI Company Starter",
      rootPath: path.join(AI_NATIVE_ROOT, "ai-company-starter-main"),
      kind: "command-set",
    },
    adapter: aiCompanyStarterMainAdapter,
    skillAdapter: aiCompanyStarterMainSkillsAdapter,
  },
  {
    agent: {
      id: "plh-ops",
      name: "PLH Ops",
      rootPath: path.join(AI_NATIVE_ROOT, "plh-ops"),
      kind: "report-log",
    },
    adapter: plhOpsAdapter,
    skillAdapter: plhOpsSkillsAdapter,
  },
]

export type Builtins = {
  agents: Agent[]
  adapters: Record<string, Adapter>
  skillAdapters: Record<string, SkillAdapter>
}

export function buildBuiltins(exists: (absPath: string) => boolean): Builtins {
  const present = BUILTIN_DESCRIPTORS.filter((d) => exists(d.agent.rootPath))
  return {
    agents: present.map((d) => d.agent),
    adapters: Object.fromEntries(present.map((d) => [d.agent.id, d.adapter])),
    skillAdapters: Object.fromEntries(present.map((d) => [d.agent.id, d.skillAdapter])),
  }
}

export function loadBuiltins(): Builtins {
  return buildBuiltins((absPath) => existsSync(absPath))
}
