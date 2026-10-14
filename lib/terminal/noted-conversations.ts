import { readFile, writeFile, mkdir } from "node:fs/promises"
import path from "node:path"
import { dataPath } from "../data-dir"

/**
 * Which conversation each company has already had written down.
 *
 * This is what stops the catch-up ticker asking again every minute. It stores a
 * fingerprint rather than a timestamp because Kiro's session listing has no
 * absolute time in it — only a relative "3 seconds ago" — so there is nothing to
 * compare a clock against. A fingerprint changes when the conversation does,
 * which is the only question being asked.
 *
 * It also replaces comparing against the newest note's mtime, which had a real
 * hole: editing an old note bumped its mtime and silently suppressed the next
 * catch-up.
 */
const DEFAULT_PATH = dataPath("noted-conversations.json")

type Noted = Record<string, string>

async function read(storePath: string): Promise<Noted> {
  try {
    const parsed = JSON.parse(await readFile(storePath, "utf-8"))
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Noted) : {}
  } catch {
    return {}
  }
}

export async function getNotedFingerprint(
  agentId: string,
  storePath: string = DEFAULT_PATH
): Promise<string | null> {
  return (await read(storePath))[agentId] ?? null
}

export async function setNotedFingerprint(
  agentId: string,
  fingerprint: string,
  storePath: string = DEFAULT_PATH
): Promise<void> {
  const noted = await read(storePath)
  noted[agentId] = fingerprint
  await mkdir(path.dirname(storePath), { recursive: true })
  await writeFile(storePath, JSON.stringify(noted, null, 2), "utf-8")
}
