import { spawn as defaultSpawn, type ChildProcess } from "node:child_process"
import { writeFile } from "node:fs/promises"
import path from "node:path"
import { getEffectiveAgents } from "./get-effective-agents"
import { resolveAiExecutorForAgent } from "./ai-executor-registry"
import { buildInteractiveTerminalScript } from "./company-commands/build-visible-run-script"
import { DATA_DIR } from "./data-dir"

export type SpawnFn = (command: string, args: string[], opts: Record<string, unknown>) => ChildProcess
export type GetAgentsFn = typeof getEffectiveAgents
export type ResolveExecutorFn = typeof resolveAiExecutorForAgent

export type OpenTerminalResult = { started: boolean; message: string }

/**
 * Opens a real Terminal window, cd'd into the company's own directory,
 * running a plain interactive session of whichever AI executor is
 * configured for it. Deliberately not scoped or gated — this hands full
 * control to the user, exactly as if they'd `cd`'d there and run the
 * executor themselves. The only thing this exists to remove is the need to
 * find the company's path and type the command by hand.
 */
export async function openInteractiveTerminalImpl(
  agentId: string,
  spawnFn: SpawnFn = defaultSpawn,
  getAgents: GetAgentsFn = getEffectiveAgents,
  resolveExecutor: ResolveExecutorFn = resolveAiExecutorForAgent,
  platform: NodeJS.Platform = process.platform,
  dataDir: string = DATA_DIR
): Promise<OpenTerminalResult> {
  const agents = await getAgents()
  const agent = agents.find((a) => a.id === agentId)
  if (!agent || agent.kind !== "command-set") {
    return { started: false, message: "Unknown company" }
  }

  const executor = await resolveExecutor(agent.id)

  if (platform !== "darwin") {
    return {
      started: false,
      message: `Opening a Terminal window is only supported on macOS. Run "${executor.binaryName}" yourself in ${agent.rootPath}.`,
    }
  }

  const scriptPath = path.join(dataDir, `${agent.id}.open-terminal.sh`)
  const script = buildInteractiveTerminalScript({ binaryName: executor.binaryName, cwd: agent.rootPath })
  await writeFile(scriptPath, script, { mode: 0o755 })

  const child = spawnFn("open", ["-a", "Terminal", scriptPath], {
    cwd: agent.rootPath,
    detached: true,
    stdio: ["ignore", "ignore", "ignore"],
  })
  child.unref()
  return { started: true, message: "Opened Terminal" }
}
