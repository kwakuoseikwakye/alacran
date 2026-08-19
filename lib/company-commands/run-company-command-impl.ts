import { spawn as nodeSpawn, execFile as nodeExecFile } from "node:child_process"
import { promisify } from "node:util"
import { openSync, closeSync } from "node:fs"
import { readdir, readFile, writeFile, mkdir, appendFile } from "node:fs/promises"
import path from "node:path"
import { getEffectiveAgents } from "../get-effective-agents"
import { readGoogleAccounts } from "../google-accounts-config"
import { getCompanyCommand } from "./registry"
import type { CompanyCommand } from "./types"
import { COMPANY_COMMANDS_DATA_DIR } from "./paths"
import { acquireRunLock, releaseRunLock, runLockPath } from "./run-lock"
import { runPrefetch } from "./prefetch"
import { resolveAiExecutorForAgent } from "../ai-executor-registry"
import type { AiExecutor } from "../ai-executors"
import { getVisibleRunForAgent } from "../visible-run-registry"
import { buildVisibleRunScript } from "./build-visible-run-script"
import { resolveTerminalLaunchCommand, launchTerminalScript } from "../terminal-launch-command"

export type ResolveExecutorFn = (agentId: string) => Promise<AiExecutor>
export type ResolveVisibleRunFn = (agentId: string) => Promise<boolean>

const execFileAsync = promisify(nodeExecFile)
const MAX_FIELD_LENGTH = 4000

export type SpawnOptions = {
  cwd: string
  detached: boolean
  // "pipe" is here for the visible-run branch only: launchTerminalScript reads
  // the emulator's stderr, because on Linux that text is the only evidence of
  // why a window didn't appear.
  stdio: ["ignore", number | "ignore", number | "ignore" | "pipe"]
}
export type SpawnedProcess = {
  unref: () => void
  stderr?: {
    on: (event: "data", listener: (chunk: Buffer | string) => void) => void
    removeAllListeners: (event: "data") => void
    resume: () => void
  } | null
  on: {
    (event: "exit", listener: (code: number | null) => void): void
    // "error" is not optional decoration. When a binary isn't on PATH, Node
    // emits "error" and never emits "exit" — and an "error" event with no
    // listener is an uncaught exception that takes the whole server down.
    (event: "error", listener: (err: Error) => void): void
  }
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

/**
 * The run action has already returned "Started" by the time a spawn failure
 * arrives, so the only place left to tell the user is the log the Run tab
 * already tails. Best-effort by design — a failure to write the note must
 * not become a second unhandled rejection on the same path.
 */
async function appendSpawnFailure(logPath: string, binaryName: string, err: Error): Promise<void> {
  const note = `\nAlacrán: could not start "${binaryName}" — ${err.message}\nIs it installed and on this app's PATH? After installing it, fully quit and reopen Alacrán.\n`
  await appendFile(logPath, note, "utf-8").catch(() => {})
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

  // Resolved before the lock and before any prefetch: a command that can't
  // legally run on this company's executor must cost nothing at all — no
  // lock to leak, and no `gog`/`gh` round-trip against the user's real
  // mailbox or issue tracker for a run that was never going to spawn.
  const executor = await resolveExecutor(agent.id)
  if (command.untrustedInput && !executor.enforcesToolScope) {
    return {
      started: false,
      message:
        `/${command.id} reads content written by people outside this company, so it only runs on an AI tool that can be ` +
        `restricted to this command's own output folder. ${executor.label} has no such restriction — it would run that ` +
        `content with full write access to the whole repo. Switch this company to Claude Code to run /${command.id}.`,
    }
  }

  await mkdir(dataDir, { recursive: true })
  const acquired = await acquireRunLock(dataDir)
  if (!acquired) {
    return { started: false, message: "Already running" }
  }

  let outFd: number | undefined
  try {
    const today = new Date().toISOString().slice(0, 10)
    // Empty (never assigned, via lib/google-accounts-config.ts) falls back to
    // gog's own "auto" resolution — this is the byte-for-byte-unchanged
    // default every company had before this feature existed.
    const configuredAccounts = await readGoogleAccounts(agent.rootPath)
    const accounts = configuredAccounts.length > 0 ? configuredAccounts : ["auto"]
    const prefetchResult = await runPrefetch(command.prefetchKind, {
      agentRootPath: agent.rootPath,
      fieldValues,
      execFn,
      accounts,
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

    const prompt = command.buildPrompt(fieldValues, today, prefetch, accounts)

    const editScopePattern =
      command.outputKind === "new-file-in-dir" ? `${command.outputPath}/**` : command.outputPath

    const bashPatterns =
      typeof command.bashPatterns === "function" ? command.bashPatterns(accounts) : (command.bashPatterns ?? [])
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
      // An exit is NOT completion on this path and must never be read as one:
      // the launcher returns the instant the window is told to open, long
      // before the script — let alone the run inside it — finishes, and the
      // wrapper script's own `trap ... EXIT` is what releases the lock. What
      // launchTerminalScript watches for is narrower and does not collide with
      // that: a non-zero exit inside its settle window, which the run script
      // cannot produce because it is still holding the gate open. Either that
      // or an outright failure to start means the script never ran, its trap
      // never fires, and nothing else would ever release the lock.
      const outcome = await launchTerminalScript(terminalLaunch, scriptPath, agent.rootPath, spawnFn)
      if (!outcome.opened) {
        await appendSpawnFailure(logPath, terminalLaunch.command, new Error(outcome.reason))
        await releaseRunLock(dataDir).catch(() => {})
        return { started: false, message: `Couldn't open a terminal — ${outcome.reason}` }
      }
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
    // Without this the run is unrecoverable twice over: the unhandled "error"
    // event crashes the server, and because "exit" never fires for a failed
    // spawn the lock survives the restart — lib/file-lock.ts has no staleness
    // sweep, so every later run for this company reports "Already running".
    child.on("error", (err) => {
      void appendSpawnFailure(logPath, executor.binaryName, err)
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
