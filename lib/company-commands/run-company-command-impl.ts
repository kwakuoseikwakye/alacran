import { spawn as nodeSpawn, execFile as nodeExecFile } from "node:child_process"
import { promisify } from "node:util"
import { openSync, closeSync } from "node:fs"
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises"
import path from "node:path"
import { AGENTS } from "../config"
import { getCompanyCommand } from "./registry"
import type { CompanyCommand } from "./types"
import { COMPANY_COMMANDS_DATA_DIR } from "./paths"
import { acquireRunLock, releaseRunLock } from "./run-lock"

const execFileAsync = promisify(nodeExecFile)
const AI_COMPANY_STARTER_MAIN_ID = "ai-company-starter-main"
const MAX_FIELD_LENGTH = 4000

export type SpawnOptions = {
  cwd: string
  detached: boolean
  stdio: ["ignore", number, number]
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

async function buildPrefetch(agentRootPath: string, execFn: ExecFileFn): Promise<string> {
  let gitLog: string
  try {
    const { stdout } = await execFn("git", ["log", "--since=24 hours ago", "--oneline"], { cwd: agentRootPath })
    gitLog = stdout.trim() || "(no commits in the last 24 hours)"
  } catch (err) {
    gitLog = `(unable to read git log: ${err instanceof Error ? err.message : String(err)})`
  }

  let issues: string
  try {
    const { stdout } = await execFn("gh", ["issue", "list", "--state", "open", "--limit", "10"], { cwd: agentRootPath })
    issues = stdout.trim() || "(no open issues)"
  } catch {
    issues = "(gh unavailable or not authenticated — issue status not confirmed this run)"
  }

  return `--- git log (last 24 hours) ---\n${gitLog}\n\n--- open issues (gh issue list, up to 10) ---\n${issues}`
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
  spawnFn: SpawnFn = defaultSpawn,
  execFn: ExecFileFn = defaultExecFile,
  dataDir: string = COMPANY_COMMANDS_DATA_DIR
): Promise<{ started: boolean; message: string }> {
  const command = getCompanyCommand(commandId)
  if (!command) {
    return { started: false, message: `Unknown command "${commandId}"` }
  }

  const fieldError = validateFields(command, fieldValues)
  if (fieldError) {
    return { started: false, message: fieldError }
  }

  const agent = AGENTS.find((a) => a.id === AI_COMPANY_STARTER_MAIN_ID)
  if (!agent) {
    return { started: false, message: `Agent "${AI_COMPANY_STARTER_MAIN_ID}" is not configured` }
  }

  await mkdir(dataDir, { recursive: true })
  const acquired = await acquireRunLock(dataDir)
  if (!acquired) {
    return { started: false, message: "Already running" }
  }

  let outFd: number | undefined
  try {
    const before = await takeBeforeSnapshot(agent.rootPath, command)
    await writeFile(
      path.join(dataDir, `${command.id}.run.json`),
      JSON.stringify({ commandId: command.id, outputKind: command.outputKind, outputPath: command.outputPath, before }),
      "utf-8"
    )

    const today = new Date().toISOString().slice(0, 10)
    const prefetch = command.needsPrefetch ? await buildPrefetch(agent.rootPath, execFn) : ""
    const prompt = command.buildPrompt(fieldValues, today, prefetch)

    const addDirAbs =
      command.outputKind === "known-file"
        ? path.join(agent.rootPath, path.dirname(command.outputPath))
        : path.join(agent.rootPath, command.outputPath)

    const logPath = path.join(dataDir, `${command.id}.log`)
    outFd = openSync(logPath, "a")
    const child = spawnFn(
      "claude",
      [
        "-p",
        prompt,
        "--add-dir",
        addDirAbs,
        "--allowedTools",
        "Read,Grep,Glob,Write",
        "--disallowedTools",
        "Bash",
        "--permission-mode",
        "acceptEdits",
        "--output-format",
        "text",
      ],
      { cwd: agent.rootPath, detached: true, stdio: ["ignore", outFd, outFd] }
    )
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
