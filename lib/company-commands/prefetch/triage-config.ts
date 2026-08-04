import { readFile } from "node:fs/promises"
import path from "node:path"
import { parse } from "yaml"

export const SENDERS_RELATIVE_PATH = "definitions/triage/senders.yaml"
export const REPOS_RELATIVE_PATH = "definitions/triage/repos.yaml"

export type TriageRepo = { name: string; path: string; description: string }
export type ReadFileFn = (filePath: string) => Promise<string>

const defaultReadFile: ReadFileFn = (filePath) => readFile(filePath, "utf-8")

export type SendersResult = { ok: true; senders: string[] } | { ok: false; message: string }
export type ReposResult = { ok: true; repos: TriageRepo[] } | { ok: false; message: string }

/**
 * Extracts the bare address from a From header, which may be either a plain
 * address or `Display Name <addr@host>`. Anchored on the closing bracket so a
 * lookalike suffix (`takeshi@plh.life.evil.com`) cannot pass the equality check
 * downstream.
 */
function bareAddress(from: string): string {
  const bracketed = /<([^>]+)>/.exec(from)
  return (bracketed ? bracketed[1] : from).trim().toLowerCase()
}

export function isAllowlistedSender(from: string, senders: string[]): boolean {
  const address = bareAddress(from)
  if (address === "") return false
  return senders.some((s) => s.trim().toLowerCase() === address)
}

export async function readTriageSenders(
  agentRootPath: string,
  readFileFn: ReadFileFn = defaultReadFile
): Promise<SendersResult> {
  const absolute = path.join(agentRootPath, SENDERS_RELATIVE_PATH)
  let raw: string
  try {
    raw = await readFileFn(absolute)
  } catch {
    return {
      ok: false,
      message: `No sender allowlist found. Create ${SENDERS_RELATIVE_PATH} in this company with a "senders:" list before running triage.`,
    }
  }

  let parsed: unknown
  try {
    parsed = parse(raw)
  } catch (err) {
    return {
      ok: false,
      message: `${SENDERS_RELATIVE_PATH} is not valid YAML: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  const list = (parsed as { senders?: unknown } | null)?.senders
  const senders = Array.isArray(list)
    ? list.filter((s): s is string => typeof s === "string" && s.trim() !== "")
    : []

  if (senders.length === 0) {
    return {
      ok: false,
      message: `${SENDERS_RELATIVE_PATH} lists no senders. An empty allowlist is treated as "accept nothing", not "accept anything" — add at least one address.`,
    }
  }
  return { ok: true, senders }
}

export async function readTriageRepos(
  agentRootPath: string,
  readFileFn: ReadFileFn = defaultReadFile
): Promise<ReposResult> {
  const absolute = path.join(agentRootPath, REPOS_RELATIVE_PATH)
  let raw: string
  try {
    raw = await readFileFn(absolute)
  } catch {
    return {
      ok: false,
      message: `No repo list found. Create ${REPOS_RELATIVE_PATH} in this company with a "repos:" list (name, path, description) before running triage.`,
    }
  }

  let parsed: unknown
  try {
    parsed = parse(raw)
  } catch (err) {
    return {
      ok: false,
      message: `${REPOS_RELATIVE_PATH} is not valid YAML: ${err instanceof Error ? err.message : String(err)}`,
    }
  }

  const list = (parsed as { repos?: unknown } | null)?.repos
  if (!Array.isArray(list) || list.length === 0) {
    return { ok: false, message: `${REPOS_RELATIVE_PATH} lists no repos — add at least one entry.` }
  }

  const repos: TriageRepo[] = []
  for (const entry of list) {
    const e = entry as { name?: unknown; path?: unknown; description?: unknown }
    if (typeof e?.name !== "string" || typeof e?.path !== "string") {
      return {
        ok: false,
        message: `${REPOS_RELATIVE_PATH} has an entry missing a "name" or "path".`,
      }
    }
    repos.push({
      name: e.name,
      path: e.path,
      description: typeof e.description === "string" ? e.description : "",
    })
  }
  return { ok: true, repos }
}
