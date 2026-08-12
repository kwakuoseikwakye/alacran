import { spawn as defaultSpawn, execFile as nodeExecFile, type ChildProcess } from "node:child_process"
import { promisify } from "node:util"
import { writeFile } from "node:fs/promises"
import path from "node:path"
import { getEffectiveAgents } from "./get-effective-agents"
import { resolveAiExecutorForAgent } from "./ai-executor-registry"
import { buildInteractiveTerminalScript } from "./company-commands/build-visible-run-script"
import { resolveTerminalLaunchCommand, type ExecFileFn } from "./terminal-launch-command"
import { DATA_DIR } from "./data-dir"

const execFileAsync = promisify(nodeExecFile)

async function defaultExecFile(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(command, args)
}

export type SpawnFn = (command: string, args: string[], opts: Record<string, unknown>) => ChildProcess
export type GetAgentsFn = typeof getEffectiveAgents
export type ResolveExecutorFn = typeof resolveAiExecutorForAgent

export type OpenTerminalResult = { started: boolean; message: string }

/**
 * Opens a real terminal window, cd'd into the company's own directory,
 * running a plain interactive session of whichever AI executor is
 * configured for it. Deliberately not scoped or gated — this hands full
 * control to the user, exactly as if they'd `cd`'d there and run the
 * executor themselves. The only thing this exists to remove is the need to
 * find the company's path and type the command by hand.
 *
 * macOS and Linux each need a different command to open that window at all
 * (see terminal-launch-command.ts); everything past that point is identical.
 *
 * `introPrompt`, when given, seeds the session's first message instead of
 * opening fully blank — used by the "Get Started" button to have the agent
 * read the company's own skills/definitions and introduce itself, for a
 * user who doesn't yet know what to type. Not every executor supports
 * this (see ai-executors.ts's `buildInteractiveIntroArgs`); when it
 * doesn't, this silently falls back to the same blank session `introPrompt`
 * being unset gives, and says so in the returned message rather than
 * pretending the intro happened.
 */
export async function openInteractiveTerminalImpl(
  agentId: string,
  spawnFn: SpawnFn = defaultSpawn,
  getAgents: GetAgentsFn = getEffectiveAgents,
  resolveExecutor: ResolveExecutorFn = resolveAiExecutorForAgent,
  platform: NodeJS.Platform = process.platform,
  dataDir: string = DATA_DIR,
  execFn: ExecFileFn = defaultExecFile,
  introPrompt?: string
): Promise<OpenTerminalResult> {
  const agents = await getAgents()
  const agent = agents.find((a) => a.id === agentId)
  // The one action an `external` folder gets. Get Started is NOT relaxed with
  // it: that path guards separately in open-interactive-terminal-with-help,
  // and its intro prompt reads skills and an ontology an external folder has
  // no reason to own.
  if (!agent || (agent.kind !== "command-set" && agent.kind !== "external")) {
    return { started: false, message: "Unknown company" }
  }

  const executor = await resolveExecutor(agent.id)

  const launch = await resolveTerminalLaunchCommand(platform, execFn)
  if (!launch) {
    return {
      started: false,
      message: `No supported terminal found on this machine. Run "${executor.binaryName}" yourself in ${agent.rootPath}.`,
    }
  }

  const introArgs = introPrompt ? executor.buildInteractiveIntroArgs?.(introPrompt) : undefined
  // Own filename so a "Get Started" launch never races the plain "Open in
  // Terminal" button's script file if both are clicked close together.
  const scriptPath = path.join(dataDir, `${agent.id}.${introPrompt ? "get-started" : "open-terminal"}.sh`)
  const script = buildInteractiveTerminalScript({ binaryName: executor.binaryName, cwd: agent.rootPath, introArgs })
  await writeFile(scriptPath, script, { mode: 0o755 })

  const child = spawnFn(launch.command, launch.args(scriptPath), {
    cwd: agent.rootPath,
    detached: true,
    stdio: ["ignore", "ignore", "ignore"],
  })
  // Nothing to clean up (this path holds no lock), but an "error" event with
  // no listener is an uncaught exception that would take the server down if
  // the terminal launcher itself can't start.
  child.on("error", () => {})
  child.unref()
  const skippedIntro = Boolean(introPrompt) && !introArgs
  return {
    started: true,
    message: skippedIntro
      ? `Opened Terminal (${executor.label} can't be seeded with an intro — ask it directly)`
      : "Opened Terminal",
  }
}
