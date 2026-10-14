import path from "node:path"
import os from "node:os"
import { existsSync } from "node:fs"
import type { Agent, Adapter } from "./adapters/types"
import { aiCompanyStarterMainAdapter } from "./adapters/ai-company-starter-main"
import type { SkillAdapter } from "./skills/types"
import { genericCommandSetSkillAdapter } from "./skills/generic-command-set"

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
