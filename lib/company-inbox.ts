import { readFile } from "node:fs/promises"
import path from "node:path"
import { parse } from "yaml"
import { readEnvLocal } from "./os/connectors/creds"

export const COMPANY_INBOX_RELATIVE_PATH = "definitions/integrations/inbox.yaml"

export type ReadFileFn = (filePath: string) => Promise<string>

const defaultReadFile: ReadFileFn = (filePath) => readFile(filePath, "utf-8")

/**
 * Four numbered slots, because four numbered slots is what this machine
 * actually holds — `lib/os/connectors/keys.ts` declares INBOX_1..INBOX_4 and
 * nothing else reads a fifth. A named list is the upgrade if a company ever
 * needs two of them at once (spec open question 2); it is deliberately not
 * built ahead of that need.
 */
export const INBOX_SLOTS = [1, 2, 3, 4] as const

export function isInboxSlot(value: unknown): value is number {
  return typeof value === "number" && (INBOX_SLOTS as readonly number[]).includes(value)
}

/**
 * The inboxes set up on THIS MACHINE, by slot and by the address that
 * identifies them. The address is what a person recognises — "slot 2" is not
 * a thing anyone knows about their own email — so the picker labels by it.
 *
 * Machine-scoped on purpose: INBOX_n lives in `.env.local`, the Connections
 * page owns it, and the company page only chooses among what is there.
 */
export function machineInboxOptions(
  env: Record<string, string> = readEnvLocal()
): { slot: number; email: string }[] {
  return INBOX_SLOTS.map((slot) => ({ slot, email: env[`INBOX_${slot}_USER`] ?? "" })).filter(
    (option) => option.email !== ""
  )
}

/**
 * Which inbox a company has been pointed at, or null for "nobody chose".
 *
 * Company-owned data in the company's own repo, exactly the tier of
 * definitions/integrations/google.yaml — so an interactive session reads the
 * same file the dashboard writes. Missing file, unparseable YAML and a slot
 * number nobody recognises all resolve to null rather than an error: a
 * company that has never touched this behaves as it did before the file
 * existed, and callers fall back to INBOX_1 the way they always have.
 */
export async function readCompanyInboxSlot(
  agentRootPath: string,
  readFileFn: ReadFileFn = defaultReadFile
): Promise<number | null> {
  let raw: string
  try {
    raw = await readFileFn(path.join(agentRootPath, COMPANY_INBOX_RELATIVE_PATH))
  } catch {
    return null
  }
  let parsed: unknown
  try {
    parsed = parse(raw)
  } catch {
    return null
  }
  const slot = (parsed as { inbox?: unknown } | null)?.inbox
  return isInboxSlot(slot) ? slot : null
}
