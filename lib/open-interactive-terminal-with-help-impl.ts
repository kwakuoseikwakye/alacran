import { spawn as defaultSpawn, execFile as nodeExecFile } from "node:child_process"
import { promisify } from "node:util"
import { readFile } from "node:fs/promises"
import { getEffectiveAgents } from "./get-effective-agents"
import { resolveAiExecutorForAgent } from "./ai-executor-registry"
import {
  openInteractiveTerminalImpl,
  type SpawnFn,
  type GetAgentsFn,
  type ResolveExecutorFn,
  type OpenTerminalResult,
} from "./open-interactive-terminal-impl"
import type { ExecFileFn } from "./terminal-launch-command"
import { DATA_DIR } from "./data-dir"
import { buildGetStartedIntroPrompt } from "./company-summary"

const execFileAsync = promisify(nodeExecFile)

async function defaultExecFile(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(command, args)
}

async function defaultReadFile(path: string): Promise<string> {
  return readFile(path, "utf-8")
}

/**
 * The "Get Started" button's entry point: decides fresh-vs-stale (see
 * company-summary.ts — a plain git comparison, no AI call), then delegates
 * to the exact same openInteractiveTerminalImpl "Open in Terminal" uses,
 * just with a seeded introPrompt instead of none. Looks up the agent a
 * second time (openInteractiveTerminalImpl does its own lookup too) because
 * the freshness check needs agent.rootPath before that call can even
 * happen — a small, deliberate duplication rather than reshaping the
 * already-tested inner function's contract.
 */
export async function openInteractiveTerminalWithHelpImpl(
  agentId: string,
  spawnFn: SpawnFn = defaultSpawn,
  getAgents: GetAgentsFn = getEffectiveAgents,
  resolveExecutor: ResolveExecutorFn = resolveAiExecutorForAgent,
  platform: NodeJS.Platform = process.platform,
  dataDir: string = DATA_DIR,
  execFn: ExecFileFn = defaultExecFile,
  readFileFn: (path: string) => Promise<string> = defaultReadFile
): Promise<OpenTerminalResult> {
  const agents = await getAgents()
  const agent = agents.find((a) => a.id === agentId)
  if (!agent || agent.kind !== "command-set") {
    return { started: false, message: "Unknown company" }
  }

  const introPrompt = await buildGetStartedIntroPrompt(agent.rootPath, execFn, readFileFn)

  return openInteractiveTerminalImpl(agentId, spawnFn, getAgents, resolveExecutor, platform, dataDir, execFn, introPrompt)
}
