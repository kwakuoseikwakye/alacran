import { spawn as nodeSpawn, execFile as nodeExecFile } from "node:child_process"
import { promisify } from "node:util"
import { openSync, closeSync, fstatSync } from "node:fs"
import { readdir, readFile, writeFile, mkdir, appendFile } from "node:fs/promises"
import path from "node:path"
import { getEffectiveAgents } from "../get-effective-agents"
import { getCompanyCommand } from "./registry"
import { prepareRevision, type RevisionRequest } from "./revision"
import type { CompanyCommand } from "./types"
import { COMPANY_COMMANDS_DATA_DIR } from "./paths"
import { listChangedPaths } from "./repo-changes"
import { getCompanyCommandResultImpl } from "./company-command-result-impl"
import { acquireRunLock, releaseRunLock, runLockPath } from "./run-lock"
import { runPrefetch } from "./prefetch"
import { resolveAiExecutorForAgent } from "../ai-executor-registry"
import type { AiExecutor } from "../ai-executors"
import { prepareExecutorScope } from "../executor-scope"
import { getVisibleRunForAgent } from "../visible-run-registry"
import { buildVisibleRunScript } from "./build-visible-run-script"
import { resolveTerminalLaunchCommand, launchTerminalScript } from "../terminal-launch-command"
import { isSafePostFileName } from "../content-social/posts"
import { writeRunningCommand } from "./running-command"
import { buildPreferencesBlock } from "../os/preferences/block"
import { commandJob, readReportedCost, recordRunCost } from "../jobs/cost"

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

/**
 * Exported because the live-session path (lib/terminal/save-session-note-impl.ts)
 * must record `before` in exactly the same shape this runner does — the reader
 * on the other side (`getCompanyCommandResultImpl`) is one function, so the two
 * writers cannot be allowed to drift into two formats.
 */
export async function takeBeforeSnapshot(
  agentRootPath: string,
  command: CompanyCommand
): Promise<string[] | string | null> {
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

/**
 * True when this command's last run still has new files nobody has approved or
 * discarded. A fresh snapshot would fold them into `before` — approval skipped
 * without anyone approving — so the new run joins the same pending queue
 * instead. Re-snapshotting is the only lossy operation (v148).
 */
async function hasPendingNewFiles(recordPath: string, agentRootPath: string, command: CompanyCommand): Promise<boolean> {
  if (command.outputKind !== "new-file-in-dir") return false
  try {
    const record = JSON.parse(await readFile(recordPath, "utf-8"))
    if (record.outputKind !== command.outputKind || record.outputPath !== command.outputPath || !Array.isArray(record.before)) return false
    const current = await readdir(path.join(agentRootPath, command.outputPath))
    return current.some((name) => !record.before.includes(name) && isSafePostFileName(name))
  } catch {
    return false
  }
}

/**
 * Best-effort: a cost that can't be recorded must never disturb the run's own bookkeeping.
 * ponytail: reads the whole log on exit; switch to a positioned read if logs grow large.
 */
async function recordCommandCost(
  dataDir: string,
  logPath: string,
  logStart: number,
  executor: AiExecutor,
  job: string,
  startedAt: string,
  code: number | null
): Promise<void> {
  try {
    const costUsd = executor.costReport ? readReportedCost((await readFile(logPath)).subarray(logStart).toString("utf-8"), code) : null
    await recordRunCost(dataDir, { job, executorId: executor.id, startedAt, finishedAt: new Date().toISOString(), costUsd })
  } catch {
    // nothing to tell anyone: the run itself is unaffected
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
  platform: NodeJS.Platform = process.platform,
  revision?: RevisionRequest
): Promise<{ started: boolean; message: string }> {
  const command = getCompanyCommand(commandId)
  if (!command) {
    return { started: false, message: `Unknown command "${commandId}"` }
  }

  // Before anything else, including the field check: this command has no
  // headless meaning at all. A fresh `claude -p` asked "what did we work on"
  // has no session to answer about, so it writes an empty note or invents a
  // plausible one — and a fabricated memory is the single failure this app's
  // whole premise cannot absorb. Nothing in the UI can reach this today (no
  // template file, so no Run button; not schedulable), and the guard stays
  // regardless, per the standing rule that a guard outlives the configuration
  // that makes it unreachable.
  if (command.requiresLiveSession && !revision) {
    return {
      started: false,
      message: `/${command.id} describes work you and the assistant just did together, so it only runs inside a session that's already open — not on its own.`,
    }
  }

  const fieldError = revision ? null : validateFields(command, fieldValues)
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
  if (revision && !executor.enforcesToolScope) {
    return { started: false, message: "Revising a proposal needs an AI tool that can edit only that document. Choose a tool with restricted editing first." }
  }
  if (command.untrustedInput && !executor.enforcesToolScope) {
    return {
      started: false,
      message:
        `/${command.id} reads content written by people outside this company, so it only runs on an AI tool that can be ` +
        `restricted to this command's own output folder. ${executor.label} has no such restriction — it would run that ` +
        `content with full write access to the whole repo. Switch this company to Claude Code to run /${command.id}.`,
    }
  }

  if (command.mcpTools?.length && !executor.supportsMcpToolAllowlist) {
    return {
      started: false,
      message: `${command.label} needs Claude Code for now. Choose Claude Code under "Your AI" on this company's profile.`,
    }
  }

  await mkdir(dataDir, { recursive: true })
  const acquired = await acquireRunLock(dataDir)
  if (!acquired) {
    return { started: false, message: "Already running" }
  }
  // Names this run for the office view; trusted only while the lock is held. Written
  // before the headless/visible split, so both paths are named.
  await writeRunningCommand(dataDir, { commandId: command.id, executorId: executor.id, startedAt: new Date().toISOString() })

  let outFd: number | undefined
  try {
    const today = new Date().toISOString().slice(0, 10)
    const preparedRevision = revision ? await prepareRevision(command, revision, dataDir, agent.rootPath) : null
    const prefetchResult = preparedRevision ? { ok: true as const, text: "" } : await runPrefetch(command.prefetchKind, {
      agentRootPath: agent.rootPath,
      fieldValues,
      execFn,
      dataDir,
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
    const recordPath = path.join(dataDir, `${command.id}.run.json`)
    // Pending files keep the existing record untouched — `before` and
    // `beforeDirty` both stay the earlier run's baseline, consistently.
    if (!preparedRevision && !(await hasPendingNewFiles(recordPath, agent.rootPath, command))) {
      const before = await takeBeforeSnapshot(agent.rootPath, command)
      // What the whole repo already had dirty. The result reader subtracts this
      // to work out what the RUN touched outside its own output folder — see
      // repo-changes.ts. Recorded even for Claude Code, which cannot stray: a
      // guard that only runs for the executor currently believed to need it
      // proves nothing on the day that belief is wrong.
      const beforeDirty = await listChangedPaths(agent.rootPath, (file, args, options) =>
        execFn(file, args, options)
      ).catch(() => null)
      await writeFile(
        recordPath,
        JSON.stringify({
          commandId: command.id,
          outputKind: command.outputKind,
          outputPath: command.outputPath,
          before,
          beforeDirty,
          // The agent is asked to do its lane work now, so lane edits are attributed from this
          // moment (see ownedLanesFor in repo-changes.ts).
          ownedBaseline: beforeDirty,
          ...(command.commitTrailer ? { trailer: command.commitTrailer(fieldValues) } : {}),
        }),
        "utf-8"
      )
    }

    const preferences = !preparedRevision && command.usesPreferences ? await buildPreferencesBlock(agent.rootPath, { dataDir }) : ""
    const prompt = (preparedRevision?.prompt ?? command.buildPrompt(fieldValues, today, prefetch)) + preferences

    const editScopePattern = preparedRevision?.editScopePattern ??
      (command.outputKind === "new-file-in-dir" ? `${command.outputPath}/**` : command.outputPath)

    const bashPatterns = command.bashPatterns ?? []
    // A revision, or a command reading attacker-authored text, keeps its narrow scope; only a fresh trusted run widens to the command's alsoWrites.
    const alsoEditScopePatterns = preparedRevision || command.untrustedInput
      ? []
      : (command.alsoWrites ?? []).map((p) => (p.endsWith("/") ? `${p}**` : p))
    const scopeInput = {
      prompt,
      editScopePattern,
      ...(alsoEditScopePatterns.length > 0 ? { alsoEditScopePatterns } : {}),
      bashPatterns,
      mcpTools: command.mcpTools ?? [],
    }
    // The visible path keeps text: a person watching a terminal reads the answer, not a JSON object.
    // Headless runs ask the tool to report its cost where it can (v251).
    const argsFor = (headlessArgs: string[]) => [
      ...headlessArgs,
      // Summarising upkeep runs on the cheapest model the executor offers.
      ...(command.routine ? (executor.routineModelArgs ?? []) : []),
    ]
    const job = commandJob(agent.id, command.id)
    const startedAt = new Date().toISOString()

    // For an executor whose edit scope is a file rather than argv (Kiro), this
    // is where the sandbox actually gets created. Inside the try and after the
    // lock on purpose: a throw here must release the lock and abort the run
    // rather than spawn an agent with no scope — which is exactly what a
    // command wanting scoped Bash on Kiro does today.
    await prepareExecutorScope(executor.id, scopeInput, agent.rootPath)

    const logPath = path.join(dataDir, `${command.id}.log`)
    const wantsVisible = await resolveVisibleRun(agentId)
    const terminalLaunch = wantsVisible
      ? await resolveTerminalLaunchCommand(platform, (cmd, cmdArgs) => execFn(cmd, cmdArgs, { cwd: agent.rootPath }))
      : null

    if (terminalLaunch) {
      const visibleArgs = argsFor(executor.buildArgs(scopeInput))
      if (visibleArgs.some((a) => a.includes("\0"))) {
        throw new Error("Refusing to run: a NUL byte in the command arguments would corrupt the args file")
      }
      const argsPath = path.join(dataDir, `${command.id}.args`)
      const promptPath = path.join(dataDir, `${command.id}.prompt`)
      const scriptPath = path.join(dataDir, `${command.id}.run.sh`)
      await writeFile(argsPath, visibleArgs.join("\0") + "\0", "utf-8")
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
      // The terminal really opened: only now is the prefetch's evidence consumed.
      await prefetchResult.onRunStart?.().catch(() => {})
      // Node never learns when this run ends (the script's trap releases the lock), so it is
      // counted now, as a run whose cost isn't known.
      await recordRunCost(dataDir, { job, executorId: executor.id, startedAt, finishedAt: null, costUsd: null }).catch(() => {})
      return { started: true, message: "Started" }
    }

    outFd = openSync(logPath, "a")
    // Where this run's own output starts, so its cost is read from its own lines only.
    const logStart = fstatSync(outFd).size
    const child = spawnFn(executor.binaryName, argsFor(executor.costReport?.args(scopeInput) ?? executor.buildArgs(scopeInput)), {
      cwd: agent.rootPath,
      detached: true,
      stdio: ["ignore", outFd, outFd],
    })
    child.on("exit", (code) => {
      void recordCommandCost(dataDir, logPath, logStart, executor, job, startedAt, code)
      // Released first: the result reader drops a run that changed nothing only once no run is in flight (v238).
      releaseRunLock(dataDir)
        .catch(() => {})
        .then(() => (command.alsoWrites?.length ? getCompanyCommandResultImpl(command.id, dataDir, agent.rootPath, execFn, true, { justFinished: true }) : undefined))
        .catch(() => {})
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
    // The spawn succeeded: only now is the prefetch's evidence consumed.
    await prefetchResult.onRunStart?.().catch(() => {})
    return { started: true, message: "Started" }
  } catch (err) {
    await releaseRunLock(dataDir).catch(() => {})
    return { started: false, message: err instanceof Error ? err.message : String(err) }
  } finally {
    if (outFd !== undefined) closeSync(outFd)
  }
}
