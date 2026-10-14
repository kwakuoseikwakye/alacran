// lib/credentials/resolve.ts
import { readFile } from "node:fs/promises"
import path from "node:path"
import { parseEnvFile, runtimeEnv } from "@/lib/os/connectors/creds"

export type ReadFileFn = (filePath: string) => Promise<string>
const defaultReadFile: ReadFileFn = (filePath) => readFile(filePath, "utf-8")

export type CredentialSource = "company" | "machine" | "unset"
export type ResolvedCredential = { value: string | null; source: CredentialSource }

/**
 * Names the same secret can appear under. The company file is written by the
 * `api-connect` skill, whose SKILL.md tells it to use the name in the
 * vendor's own docs; `.env.local` is written by this app under its own name.
 * Listed vendor-name-first because that is what the company file contains.
 *
 * One table rather than an alias check at each call site — same reasoning as
 * readCompanyEnvVar being one reader for every connector.
 */
export const CREDENTIAL_ALIASES: Record<string, string[]> = {
  NOTION_API_KEY: ["NOTION_TOKEN", "NOTION_API_KEY"],
}

function namesFor(key: string): string[] {
  return CREDENTIAL_ALIASES[key] ?? [key]
}

function firstNonEmpty(env: Record<string, string | undefined>, names: string[]): string | null {
  for (const name of names) {
    const value = env[name]
    if (value) return value
  }
  return null
}

/**
 * One credential, resolved company-first.
 *
 * The company's own `<root>/.env` wins because it is the more specific
 * answer and because it lives inside the company repo — the same tier as
 * definitions/integrations/google.yaml — so it travels with the company.
 * `.env.local` is the machine default behind it.
 *
 * `agentRootPath: null` means machine-only, which is what the system
 * Connections page wants.
 */
export async function resolveCredential(
  agentRootPath: string | null,
  key: string,
  opts: { envLocalPath?: string; readFileFn?: ReadFileFn } = {}
): Promise<ResolvedCredential> {
  const names = namesFor(key)
  const readFileFn = opts.readFileFn ?? defaultReadFile

  if (agentRootPath) {
    try {
      const raw = await readFileFn(path.join(agentRootPath, ".env"))
      const value = firstNonEmpty(parseEnvFile(raw), names)
      if (value) return { value, source: "company" }
    } catch {
      // No company .env is the normal case, not an error.
    }
  }

  // runtimeEnv, not readEnvLocal: every unscoped check in
  // lib/os/connectors/statuses.ts treats `{ ...process.env, ...readEnvLocal() }`
  // as "the machine", so a key exported as a real shell variable (not written
  // into .env.local) must resolve here too, or this tier silently narrows
  // what "machine" means for every scoped check without announcing it.
  const machine = firstNonEmpty(runtimeEnv(opts.envLocalPath), names)
  if (machine) return { value: machine, source: "machine" }

  return { value: null, source: "unset" }
}
