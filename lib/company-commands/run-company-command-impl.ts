import { spawn as nodeSpawn, execFile as nodeExecFile } from "node:child_process"
import { promisify } from "node:util"
import { openSync, closeSync } from "node:fs"
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises"
import path from "node:path"
import { getEffectiveAgents } from "../get-effective-agents"
import { getCompanyCommand } from "./registry"
import type { CompanyCommand } from "./types"
import { COMPANY_COMMANDS_DATA_DIR } from "./paths"
import { acquireRunLock, releaseRunLock, runLockPath } from "./run-lock"
import { runPrefetch } from "./prefetch"
import { resolveAiExecutorForAgent } from "../ai-executor-registry"
import type { AiExecutor } from "../ai-executors"
import { getVisibleRunForAgent } from "../visible-run-registry"
import { buildVisibleRunScript } from "./build-visible-run-script"
import { resolveTerminalLaunchCommand } from "../terminal-launch-command"

export type ResolveExecutorFn = (agentId: string) => Promise<AiExecutor>
export type ResolveVisibleRunFn = (agentId: string) => Promise<boolean>

const execFileAsync = promisify(nodeExecFile)
const MAX_FIELD_LENGTH = 4000

export type SpawnOptions = {
  cwd: string
  detached: boolean
  stdio: ["ignore", number | "ignore", number | "ignore"]
}
export type SpawnedProcess = {
  unref: () => void
  on: (event: "exit", listener: (code: number | null) => void) => void
}
export type SpawnFn = (command: string, args: string[], options: SpawnOptions) => SpawnedProcess

export function defaultSpawn(command: string, args: string[], options: SpawnOptions): SpawnedProcess {
  return nodeSpawn(command, args, options)
}

export type ExecFileFn = (
  command: string,
  args: string[],
  options: { cwd: string }
) => Promise<{ stdout: string; stderr: string }>

async function defaultExecFile(
  command: string,
  args: string[],
  options: { cwd: string }
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync(command, args, options)
}

function validateFields(command: CompanyCommand, fieldValues: Record<string, string>): string | null {
  const validKeys = new Set(command.fields.map((f) => f.key))
  for (const key of Object.keys(fieldValues)) {
    if (!validKeys.has(key)) return `Unknown field "${key}"`
  }
  for (const field of command.fields) {
    const value = fieldValues[field.key] ?? ""
    if (field.required && value.trim() === "") return `Field "${field.label}" is required`
    if (value.length > MAX_FIELD_LENGTH) return `Field "${field.label}" exceeds ${MAX_FIELD_LENGTH} characters`
  }
  return null
}

async function takeBeforeSnapshot(agentRootPath: string, command: CompanyCommand): Promise<string[] | string | null> {
  const absPath = path.join(agentRootPath, command.outputPath)
  if (command.outputKind === "new-file-in-dir") {
    try {
      return await readdir(absPath)
    } catch {
      return []
    }
  }
  try {
    return await readFile(absPath, "utf-8")
  } catch {
    return null
  }
}

export async function runCompanyCommandImpl(
  commandId: string,
  fieldValues: Record<string, string>,
  agentId: string,
  spawnFn: SpawnFn = defaultSpawn,
  execFn: ExecFileFn = defaultExecFile,
  dataDir: string = path.join(COMPANY_COMMANDS_DATA_DIR, agentId),
  resolveExecutor: ResolveExecutorFn = resolveAiExecutorForAgent,
  resolveVisibleRun: ResolveVisibleRunFn = getVisibleRunForAgent,
  platform: NodeJS.Platform = process.platform
): Promise<{ started: boolean; message: string }> {
  const command = getCompanyCommand(commandId)
  if (!command) {
    return { started: false, message: `Unknown command "${commandId}"` }
  }

  const fieldError = validateFields(command, fieldValues)
  if (fieldError) {
    return { started: false, message: fieldError }
  }

  const agents = await getEffectiveAgents()
  const agent = agents.find((a) => a.id === agentId)
  if (!agent) {
    return { started: false, message: `Unknown company "${agentId}"` }
  }

  await mkdir(dataDir, { recursive: true })
  const acquired = await acquireRunLock(dataDir)
  if (!acquired) {
    return { started: false, message: "Already running" }
  }

  let outFd: number | undefined
  try {
    const today = new Date().toISOString().slice(0, 10)
    const prefetchResult = await runPrefetch(command.prefetchKind, {
      agentRootPath: agent.rootPath,
      fieldValues,
      execFn,
    })
    if (!prefetchResult.ok) {
      // Refuse before spawning: a doomed run must not cost an API call. Release
      // the lock we already hold, or the feature wedges until the next restart.
      // The `.catch` matters as much as the release: without it a failure to
      // release would replace the refusal reason with a filesystem error in the
      // outer catch, hiding exactly the information this seam exists to surface.
      await releaseRunLock(dataDir).catch(() => {})
      return { started: false, message: prefetchResult.message }
    }
    const prefetch = prefetchResult.text

    // Snapshot only once the run is actually going to happen. A refusal is the
    // first way (v32) to reach the end of a run without spawning, and taking a
    // fresh snapshot on that path would fold a previous run's still-unconfirmed
    // output file into `before` — after which the result reader reports "No
    // changes produced." and the operator's pending review is gone, even though
    // the file is still sitting on disk.
    const before = await takeBeforeSnapshot(agent.rootPath, command)
    await writeFile(
      path.join(dataDir, `${command.id}.run.json`),
      JSON.stringify({ commandId: command.id, outputKind: command.outputKind, outputPath: command.outputPath, before }),
      "utf-8"
    )

    const prompt = command.buildPrompt(fieldValues, today, prefetch)

    const editScopePattern =
      command.outputKind === "new-file-in-dir" ? `${command.outputPath}/**` : command.outputPath

    const bashPatterns = command.bashPatterns ?? []
    const executor = await resolveExecutor(agent.id)
    const spawnArgs = executor.buildArgs({ prompt, editScopePattern, bashPatterns })

    const logPath = path.join(dataDir, `${command.id}.log`)
    const wantsVisible = await resolveVisibleRun(agentId)
    const terminalLaunch = wantsVisible
      ? await resolveTerminalLaunchCommand(platform, (cmd, cmdArgs) => execFn(cmd, cmdArgs, { cwd: agent.rootPath }))
      : null

    if (terminalLaunch) {
      if (spawnArgs.some((a) => a.includes("\0"))) {
        throw new Error("Refusing to run: a NUL byte in the command arguments would corrupt the args file")
      }
      const argsPath = path.join(dataDir, `${command.id}.args`)
      const promptPath = path.join(dataDir, `${command.id}.prompt`)
      const scriptPath = path.join(dataDir, `${command.id}.run.sh`)
      await writeFile(argsPath, spawnArgs.join("\0") + "\0", "utf-8")
      await writeFile(promptPath, prompt, "utf-8")
      const script = buildVisibleRunScript({
        binaryName: executor.binaryName,
        argsFilePath: argsPath,
        promptFilePath: promptPath,
        logPath,
        lockPath: runLockPath(dataDir),
        cwd: agent.rootPath,
      })
      await writeFile(scriptPath, script, { mode: 0o755 })
      const child = spawnFn(terminalLaunch.command, terminalLaunch.args(scriptPath), {
        cwd: agent.rootPath,
        detached: true,
        stdio: ["ignore", "ignore", "ignore"],
      })
      // Deliberately NOT attaching an "exit" handler here: the terminal
      // launcher returns the instant the window is told to open, long
      // before the script — let alone the run inside it — finishes. The wrapper
      // script's own `trap ... EXIT` releases the lock instead; attaching
      // this handler too would release it immediately and the app would
      // report "finished" while the gate is still waiting for Enter.
      child.unref()
      return { started: true, message: "Started" }
    }

    outFd = openSync(logPath, "a")
    const child = spawnFn(executor.binaryName, spawnArgs, {
      cwd: agent.rootPath,
      detached: true,
      stdio: ["ignore", outFd, outFd],
    })
    child.on("exit", () => {
      releaseRunLock(dataDir).catch(() => {})
    })
    child.unref()
    return { started: true, message: "Started" }
  } catch (err) {
    await releaseRunLock(dataDir).catch(() => {})
    return { started: false, message: err instanceof Error ? err.message : String(err) }
  } finally {
    if (outFd !== undefined) closeSync(outFd)
  }
}
